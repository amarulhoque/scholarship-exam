/**
 * Offline mark entry, grading and publication.
 *
 * A result lives in two places once published:
 *   results/{examYear}_{regNo}       full record, admin-only
 *   publicResults/{examYear}_{regNo} sanitised copy the portal can read
 * Drafts never reach publicResults, so nothing leaks before publication day.
 */
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch,
  query, where, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, auth, APP } from './firebase.js';
import { computeResult, assignRanks, chunk } from '../utils/helpers.js';
import { logActivity } from './reportService.js';

const results = collection(db, APP.collections.results);
const publicResults = collection(db, APP.collections.publicResults);
const subjects = collection(db, APP.collections.subjects);

export const resultId = (examYear, regNo) => `${examYear}_${regNo}`;

/* -------------------------------------------------------------- subjects */

/** Subjects differ per class, so every lookup is scoped to (year, class). */
export async function listSubjects(examYear, cls) {
  const snap = await getDocs(query(subjects,
    where('examYear', '==', examYear), where('class', '==', cls), orderBy('order')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveSubject(subject) {
  const id = subject.id || `${subject.examYear}_${subject.class}_${subject.name}`.replace(/\s+/g, '-').toLowerCase();
  await setDoc(doc(subjects, id), {
    ...subject,
    fullMarks: Number(subject.fullMarks),
    passMarks: Number(subject.passMarks ?? Math.round(subject.fullMarks * 0.33)),
    order: Number(subject.order ?? 0)
  }, { merge: true });
  return id;
}

export const deleteSubject = (id) => deleteDoc(doc(subjects, id));

/* ---------------------------------------------------------------- results */

export async function getResult(examYear, regNo) {
  const snap = await getDoc(doc(results, resultId(examYear, regNo)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Saves marks as a draft. Totals and grades are recomputed here rather than
 * trusted from the form, so a stale tab can never write a wrong total.
 */
export async function saveDraft(student, marks, subjectList) {
  const computed = computeResult(marks, subjectList);
  const id = resultId(student.examYear, student.regNo);

  await setDoc(doc(results, id), {
    regNo: student.regNo,
    studentId: student.id,
    studentName: student.name,
    examYear: student.examYear,
    class: student.class,
    schoolId: student.schoolId,
    schoolName: student.schoolName,
    district: student.district,
    marks,
    ...computed,
    status: 'draft',
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.uid ?? null
  }, { merge: true });

  return { id, ...computed };
}

export async function listResults(examYear, { cls, schoolId, district, status } = {}) {
  const snap = await getDocs(query(results,
    where('examYear', '==', examYear),
    ...(cls ? [where('class', '==', cls)] : []),
    ...(schoolId ? [where('schoolId', '==', schoolId)] : []),
    ...(district ? [where('district', '==', district)] : []),
    ...(status ? [where('status', '==', status)] : [])));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Recomputes merit, school and district ranks across a whole class, then
 * publishes. Ranks are only meaningful relative to the full cohort, which is
 * why publication happens per class rather than per student.
 */
export async function publishClass(examYear, cls, { onProgress } = {}) {
  const rows = await listResults(examYear, { cls });
  if (!rows.length) throw new Error(`No marks have been entered for class ${cls}.`);

  const ranked = assignRanks(rows, 'total', 'meritPosition');
  const bySchool = groupRank(ranked, 'schoolId', 'schoolRank');
  const byDistrict = groupRank(bySchool, 'district', 'districtRank');

  let done = 0;
  for (const group of chunk(byDistrict, 250)) {
    const batch = writeBatch(db);
    for (const row of group) {
      const payload = {
        meritPosition: row.meritPosition,
        schoolRank: row.schoolRank,
        districtRank: row.districtRank,
        status: 'published',
        publishedAt: serverTimestamp(),
        publishedBy: auth.currentUser?.uid ?? null
      };
      batch.update(doc(results, row.id), payload);
      batch.set(doc(publicResults, row.id), publicView(row, payload));
    }
    await batch.commit();
    done += group.length;
    onProgress?.(done, byDistrict.length);
  }

  await logActivity('result.publish', `Published ${byDistrict.length} results for class ${cls}, ${examYear}`);
  return byDistrict.length;
}

/** Pulls a class back to draft and removes it from the public portal. */
export async function unpublishClass(examYear, cls) {
  const rows = await listResults(examYear, { cls, status: 'published' });
  for (const group of chunk(rows, 250)) {
    const batch = writeBatch(db);
    for (const row of group) {
      batch.update(doc(results, row.id), { status: 'draft', publishedAt: null });
      batch.delete(doc(publicResults, row.id));
    }
    await batch.commit();
  }
  await logActivity('result.unpublish', `Withdrew ${rows.length} results for class ${cls}`);
  return rows.length;
}

/** Fields a member of the public is allowed to see. Nothing else is copied. */
function publicView(row, extra) {
  return {
    regNo: row.regNo,
    examYear: row.examYear,
    studentName: row.studentName,
    schoolName: row.schoolName,
    class: row.class,
    district: row.district,
    marks: row.marks,
    total: row.total,
    fullMarks: row.fullMarks,
    percentage: row.percentage,
    grade: row.grade,
    gpa: row.gpa,
    passed: row.passed,
    meritPosition: extra.meritPosition,
    schoolRank: extra.schoolRank,
    districtRank: extra.districtRank,
    /** Last four digits only — enough to gate a lookup, useless if leaked. */
    mobileTail: String(row.mobile ?? '').slice(-4),
    publishedAt: serverTimestamp()
  };
}

function groupRank(rows, groupKey, field) {
  const groups = rows.reduce((acc, r) => {
    (acc[r[groupKey] || 'none'] ??= []).push(r); return acc;
  }, {});
  return Object.values(groups).flatMap((g) => assignRanks(g, 'total', field));
}

/* ------------------------------------------------------------- merit list */

export async function meritList(examYear, { cls, schoolId, district, top = 20 } = {}) {
  const rows = (await listResults(examYear, { cls, schoolId, district, status: 'published' }))
    .filter((r) => r.passed);
  return assignRanks(rows, 'total', 'position').slice(0, top);
}

/* --------------------------------------------------------- public lookup */

/**
 * Portal lookup. Reads only the sanitised mirror and requires the mobile number
 * on file to match, so a guessed registration number alone reveals nothing.
 */
export async function lookupPublicResult(regNo, mobile) {
  const clean = regNo.trim().toUpperCase();
  const snap = await getDocs(query(publicResults, where('regNo', '==', clean)));
  if (snap.empty) return { found: false };

  const row = { id: snap.docs[0].id, ...snap.docs[0].data() };
  const tail = String(mobile).replace(/\D/g, '').slice(-4);
  if (row.mobileTail && tail !== row.mobileTail) return { found: false, mismatch: true };

  delete row.mobileTail;
  return { found: true, result: row };
}
