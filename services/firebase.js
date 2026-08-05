/**
 * Firebase bootstrap — the only file you edit to connect your own project.
 * Everything else imports `db`, `auth`, `storage` from here.
 *
 * These keys are not secrets: a web API key identifies the project, it does not
 * grant access. Access is controlled entirely by firestore.rules / storage.rules.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, browserLocalPersistence, browserSessionPersistence, setPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyDecsSqX8HFNpxT3o_iniPc1Y39hEIXpyo',
  authDomain: 'hossain-scholarship.firebaseapp.com',
  projectId: 'hossain-scholarship',
  storageBucket: 'hossain-scholarship.firebasestorage.app',
  messagingSenderId: '725583902909',
  appId: '1:725583902909:web:ede1456d395609a5af1fd4'
};

/** Fixed application constants. Change ORG/EXAM defaults in Firestore settings/general. */
export const APP = {
  regPrefix: 'HM',
  collections: {
    admins: 'admins',
    students: 'students',
    schools: 'schools',
    subjects: 'subjects',
    results: 'results',
    publicResults: 'publicResults',
    certificates: 'certificates',
    settings: 'settings',
    counters: 'counters',
    activityLogs: 'activityLogs'
  },
  roles: {
    super_admin: { label: 'Super admin', rank: 4 },
    admin:       { label: 'Admin',       rank: 3 },
    operator:    { label: 'Data entry',  rank: 2 },
    viewer:      { label: 'Result viewer', rank: 1 }
  }
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

/** "Remember me" chooses where the session token lives. */
export const setAuthPersistence = (remember) =>
  setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

export const isConfigured = () => firebaseConfig.apiKey !== 'REPLACE_ME';
