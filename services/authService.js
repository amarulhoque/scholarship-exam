/** Authentication and role resolution. */
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  sendPasswordResetEmail, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db, APP, setAuthPersistence } from './firebase.js';

/** Cached admin profile for the current session. */
let currentProfile = null;

export async function login(email, password, remember = true) {
  await setAuthPersistence(remember);
  const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await loadProfile(user.uid);

  if (!profile) {
    await signOut(auth);
    throw new Error('This account is not registered as an administrator.');
  }
  if (profile.active === false) {
    await signOut(auth);
    throw new Error('This account has been deactivated. Contact a super admin.');
  }
  await setDoc(doc(db, APP.collections.admins, user.uid), { lastLoginAt: serverTimestamp() }, { merge: true });
  return profile;
}

export const logout = () => { currentProfile = null; return signOut(auth); };

export const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim());

export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, APP.collections.admins, uid));
  currentProfile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  return currentProfile;
}

export const getProfile = () => currentProfile;

/** Resolves once Firebase has restored (or rejected) the persisted session. */
export const ready = () => new Promise((resolve) => {
  const stop = onAuthStateChanged(auth, async (user) => {
    stop();
    resolve(user ? { user, profile: await loadProfile(user.uid) } : { user: null, profile: null });
  });
});

export const watch = (cb) => onAuthStateChanged(auth, cb);

/** True when the signed-in role ranks at or above `role`. */
export function hasRole(role) {
  const mine = APP.roles[currentProfile?.role]?.rank ?? 0;
  const need = APP.roles[role]?.rank ?? 99;
  return mine >= need;
}

export const can = {
  manageAdmins: () => hasRole('super_admin'),
  manageSettings: () => hasRole('admin'),
  writeStudents: () => hasRole('operator'),
  publishResults: () => hasRole('admin'),
  viewResults: () => hasRole('viewer')
};

export const setDisplayName = (name) => updateProfile(auth.currentUser, { displayName: name });
