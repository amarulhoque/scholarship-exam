/** Settings, audit trail and dashboard aggregates. */
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc,
  query, where, orderBy, limit, serverTimestamp, getCountFromServer, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, APP } from './firebase.js';
import { groupCount } from '../utils/helpers.js';

/* --------------------------------------------------------------- settings */

const settingsRef = doc(db, APP.collections.settings, 'general');

export const DEFAULT_SETTINGS = {
  orgName: 'Hossain Memorial Foundation',
  examName: 'Hossain Memorial Scholarship Exam',
  examYear: new Date().getFullYear(),
  logoUrl: '',
  signatureUrl: '',
  signatoryName: 'Chairman',
  footer: 'Issued by the Hossain Memorial Scholarship Committee.',
  certificateEnabled: true,
  resultPortalOpen: true,
  theme: 'light'
};

let settingsCache = null;

export async function getSettings(force = false) {
  if (settingsCache && !force) return settingsCache;
  const snap = await getDoc(settingsRef);
  settingsCache = { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
  return settingsCache;
}

export async function saveSettings(patch) {
  await setDoc(settingsRef, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
  settingsCache = null;
  await logActivity('settings.update', 'Updated organisation settings');
}

/* ----------------------------------------------------------- activity log */

/** Append-only audit trail. Failures here must never block the real action. */
export async function logActivity(action, message, meta = {}) {
  try {
    await addDoc(collection(db, APP.collections.activityLogs), {
      action, message, meta,
      by: auth.currentUser?.uid ?? null,
      byName: auth.currentUser?.displayName || auth.currentUser?.email || 'system',
      at: serverTimestamp()
    });
  } catch (err) {
    console.warn('Activity log skipped:', err.message);
  }
}

export async function recentActivity(count = 12) {
  const snap = await getDocs(query(
    collection(db, APP.collections.activityLogs), orderBy('at', 'desc'), limit(count)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* -------------------------------------------------------------- dashboard */

const countOf = async (name, ...clauses) =>
  (await getCountFromServer(query(collection(db, name), ...clauses))).data().count;

/**
 * Dashboard numbers. Counts use aggregation queries (cheap); the charts need
 * the documents themselves, so they reuse one full read of the year's students.
 */
export async function dashboardStats(examYear, students) {
  const startOfToday = Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0)));

  const [schools, published, certificates, today] = await Promise.all([
    countOf(APP.collections.schools),
    countOf(APP.collections.results, where('examYear', '==', examYear), where('status', '==', 'published')),
    countOf(APP.collections.certificates, where('examYear', '==', examYear)),
    countOf(APP.collections.students, where('examYear', '==', examYear), where('createdAt', '>=', startOfToday))
  ]);

  return {
    totalStudents: students.length,
    registeredToday: today,
    totalSchools: schools,
    totalClasses: new Set(students.map((s) => s.class)).size,
    resultsPublished: published,
    certificatesGenerated: certificates,
    bySchool: groupCount(students, 'schoolName'),
    byDistrict: groupCount(students, 'district'),
    byGender: groupCount(students, 'gender'),
    byClass: groupCount(students, (s) => `Class ${s.class}`),
    trend: registrationTrend(students)
  };
}

/** Registrations per day for the last 14 days. */
function registrationTrend(students, days = 14) {
  const buckets = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    buckets[d.toISOString().slice(5, 10)] = 0;
  }
  for (const s of students) {
    const d = s.createdAt?.toDate?.();
    if (!d) continue;
    const key = d.toISOString().slice(5, 10);
    if (key in buckets) buckets[key]++;
  }
  return buckets;
}
