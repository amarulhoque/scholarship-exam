/** Student registration and records. */
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, runTransaction, serverTimestamp, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { db, storage, auth, APP } from './firebase.js';
import { formatRegNo, normalizeMobile } from '../utils/helpers.js';
import { logActivity } from './reportService.js';

const col = collection(db, APP.collections.students);

/**
 * Reserves the next registration number for an exam year.
 *
 * A transaction on counters/reg_{year} is what makes numbers sequential and
 * gap-free even when two operators submit at the same moment. Never generate
 * these client-side from a document count — that races and duplicates.
 */
export async function nextRegistrationNo(examYear) {
  const counterRef = doc(db, APP.collections.counters, `reg_${examYear}`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists() ? snap.data().seq : 0) + 1;
    tx.set(counterRef, { seq: next, examYear, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  });
  return formatRegNo(APP.regPrefix, examYear, seq);
}

/** One registration per student per exam year — matched on school + class + roll. */
export async function findDuplicate({ examYear, schoolId, class: cls, roll, mobile }) {
  const byRoll = await getDocs(query(col,
    where('examYear', '==', examYear),
    where('schoolId', '==', schoolId),
    where('class', '==', cls),
    where('roll', '==', String(roll)),
    limit(1)));
  if (!byRoll.empty) return { reason: 'roll', doc: { id: byRoll.docs[0].id, ...byRoll.docs[0].data() } };

  if (mobile) {
    const byMobile = await getDocs(query(col,
      where('examYear', '==', examYear),
      where('mobile', '==', normalizeMobile(mobile)),
      limit(1)));
    if (!byMobile.empty) return { reason: 'mobile', doc: { id: byMobile.docs[0].id, ...byMobile.docs[0].data() } };
  }
  return null;
}

export async function registerStudent(data, photoFile = null) {
  const dup = await findDuplicate(data);
  if (dup) {
    const label = dup.reason === 'roll' ? 'class roll' : 'mobile number';
    throw new Error(`Already registered for ${data.examYear}: ${dup.doc.name} holds this ${label} (${dup.doc.regNo}).`);
  }

  const regNo = await nextRegistrationNo(data.examYear);
  const payload = {
    ...data,
    regNo,
    roll: String(data.roll),
    mobile: normalizeMobile(data.mobile),
    guardianMobile: normalizeMobile(data.guardianMobile || ''),
    nameLower: String(data.name).toLowerCase(),
    photoUrl: '',
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid ?? null
  };

  const created = await addDoc(col, payload);
  if (photoFile) {
    payload.photoUrl = await uploadPhoto(created.id, photoFile);
    await updateDoc(created, { photoUrl: payload.photoUrl });
  }

  await logActivity('student.register', `Registered ${data.name} (${regNo})`);
  return { id: created.id, ...payload };
}

export async function uploadPhoto(studentId, file) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Photo must be 2 MB or smaller.');
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Photo must be a JPG, PNG or WebP file.');
  const path = `students/${studentId}/photo.${file.type.split('/')[1]}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  return getDownloadURL(ref(storage, path));
}

export const getStudent = async (id) => {
  const snap = await getDoc(doc(col, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export async function getByRegNo(regNo) {
  const snap = await getDocs(query(col, where('regNo', '==', regNo.trim().toUpperCase()), limit(1)));
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function updateStudent(id, patch) {
  if (patch.name) patch.nameLower = patch.name.toLowerCase();
  if (patch.mobile) patch.mobile = normalizeMobile(patch.mobile);
  await updateDoc(doc(col, id), { ...patch, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid ?? null });
  await logActivity('student.update', `Updated student ${patch.regNo ?? id}`);
}

export async function deleteStudent(id) {
  const student = await getStudent(id);
  await deleteDoc(doc(col, id));
  if (student?.photoUrl) await deleteObject(ref(storage, `students/${id}/photo.jpeg`)).catch(() => {});
  await logActivity('student.delete', `Deleted student ${student?.regNo ?? id}`);
}

/**
 * Paginated, filtered listing.
 * Firestore has no substring search, so `search` matches a name prefix
 * (nameLower >= q, < q + \uf8ff) or an exact registration number.
 */
export async function listStudents({
  examYear, schoolId, class: cls, district, gender, search, pageSize = 25, cursor = null
} = {}) {
  if (search?.trim()) {
    const q = search.trim();
    if (/^HM-/i.test(q)) {
      const one = await getByRegNo(q);
      return { rows: one ? [one] : [], cursor: null, done: true };
    }
    const snap = await getDocs(query(col,
      ...(examYear ? [where('examYear', '==', examYear)] : []),
      orderBy('nameLower'),
      where('nameLower', '>=', q.toLowerCase()),
      where('nameLower', '<', q.toLowerCase() + '\uf8ff'),
      limit(pageSize)));
    return { rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })), cursor: null, done: true };
  }

  const clauses = [
    ...(examYear ? [where('examYear', '==', examYear)] : []),
    ...(schoolId ? [where('schoolId', '==', schoolId)] : []),
    ...(cls ? [where('class', '==', cls)] : []),
    ...(district ? [where('district', '==', district)] : []),
    ...(gender ? [where('gender', '==', gender)] : []),
    orderBy('regNo'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(pageSize)
  ];
  const snap = await getDocs(query(col, ...clauses));
  return {
    rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs.at(-1) ?? null,
    done: snap.size < pageSize
  };
}

/** Loads every student for an exam year — used by reports, charts and merit lists. */
export async function allStudents(examYear) {
  const snap = await getDocs(query(col, where('examYear', '==', examYear), orderBy('regNo')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function countStudents(filters = []) {
  const snap = await getCountFromServer(query(col, ...filters));
  return snap.data().count;
}

export const whereEq = (field, value) => where(field, '==', value);

/**
 * Bulk import. Returns per-row outcomes rather than throwing, so one bad row
 * does not discard the rest of the file.
 */
export async function importStudents(rows, examYear, onProgress) {
  const results = { created: [], skipped: [] };
  for (const [i, row] of rows.entries()) {
    try {
      const student = await registerStudent({ ...row, examYear, roll: String(row.roll ?? '') });
      results.created.push(student);
    } catch (err) {
      results.skipped.push({ row: i + 2, name: row.name, reason: err.message });
    }
    onProgress?.(i + 1, rows.length);
  }
  await logActivity('student.import', `Imported ${results.created.length} of ${rows.length} rows`);
  return results;
}

export const IMPORT_COLUMNS = [
  'name', 'fatherName', 'motherName', 'mobile', 'guardianMobile', 'schoolId', 'schoolName',
  'class', 'section', 'roll', 'gender', 'dob', 'district', 'upazila', 'address'
];
