/** Participating schools. */
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, APP } from './firebase.js';
import { logActivity } from './reportService.js';

const col = collection(db, APP.collections.schools);

/** Schools change rarely, so keep one copy in memory per page load. */
let cache = null;

export async function listSchools({ district, force = false } = {}) {
  if (!cache || force) {
    const snap = await getDocs(query(col, orderBy('name')));
    cache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return district ? cache.filter((s) => s.district === district) : cache;
}

export const getSchool = async (id) => {
  const snap = await getDoc(doc(col, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export async function createSchool(data) {
  const existing = await getDocs(query(col, where('name', '==', data.name.trim()), limit(1)));
  if (!existing.empty) throw new Error('A school with this name already exists.');

  const created = await addDoc(col, {
    ...data,
    name: data.name.trim(),
    studentCount: 0,
    createdAt: serverTimestamp()
  });
  cache = null;
  await logActivity('school.create', `Added school ${data.name}`);
  return created.id;
}

export async function updateSchool(id, patch) {
  await updateDoc(doc(col, id), { ...patch, updatedAt: serverTimestamp() });
  cache = null;
  await logActivity('school.update', `Updated school ${patch.name ?? id}`);
}

export async function deleteSchool(id) {
  const students = await getDocs(query(
    collection(db, APP.collections.students), where('schoolId', '==', id), limit(1)));
  if (!students.empty) {
    throw new Error('This school still has registered students. Move or remove them first.');
  }
  await deleteDoc(doc(col, id));
  cache = null;
  await logActivity('school.delete', `Removed school ${id}`);
}

/** Distinct districts and upazilas present in the school list — drives filters. */
export async function locations() {
  const schools = await listSchools();
  const districts = [...new Set(schools.map((s) => s.district).filter(Boolean))].sort();
  const upazilas = [...new Set(schools.map((s) => s.upazila).filter(Boolean))].sort();
  return { districts, upazilas };
}

export const invalidate = () => { cache = null; };
