import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, query, where, doc, getDocs, getDoc, setDoc, deleteDoc, terminate } from 'firebase/firestore';

// Never run these fixture writes against a real project.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-trip-recovery');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:18080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:19099');
const projectId = 'demo-trip-recovery';
const recoveryCode = '__SET_RECOVERY_CODE_IN_FIREBASE_CONSOLE__';
const path = 'artifacts/my-travel-planner/public/data/trips';
const api = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
for (const [id, code] of [['allowed', recoveryCode], ['other', 'different-code']]) {
  const response = await fetch(`${api}?documentId=${id}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { shareCode: { stringValue: code }, title: { stringValue: id } } }),
  });
  assert.equal(response.status, 200, await response.text());
}

const apps = [];
const databases = [];
const client = (name) => {
  const app = initializeApp({ apiKey: 'fake-key', projectId }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  databases.push(db);
  connectFirestoreEmulator(db, '127.0.0.1', 18080);
  return { auth, db };
};
const denied = async (name, action) => {
  await assert.rejects(action, error => error.code === 'permission-denied');
  console.log(`PASS: ${name}`);
};

try {
  const { auth, db } = client('authenticated');
  await signInAnonymously(auth);
  const trips = collection(db, path);
  const snapshot = await getDocs(query(trips, where('shareCode', '==', recoveryCode)));
  assert.deepEqual(snapshot.docs.map(item => item.id), ['allowed']);
  console.log('PASS: correct code query returns only its own data');
  await denied('wrong code query', () => getDocs(query(trips, where('shareCode', '==', 'different-code'))));
  await denied('unfiltered collection query', () => getDocs(trips));
  await denied('direct document get, even with a known ID', () => getDoc(doc(db, path, 'allowed')));
  await denied('create', () => setDoc(doc(db, path, 'new'), { shareCode: recoveryCode }));
  await denied('update', () => setDoc(doc(db, path, 'allowed'), { shareCode: recoveryCode, title: 'changed' }));
  await denied('delete', () => deleteDoc(doc(db, path, 'allowed')));
  await denied('other paths', () => getDoc(doc(db, 'artifacts', 'my-travel-planner')));
  const anonymous = client('unauthenticated');
  await denied('unauthenticated correct-code query', () => getDocs(query(collection(anonymous.db, path), where('shareCode', '==', recoveryCode))));
  console.log('All 9 recovery security checks passed. Production was not accessed.');
} finally {
  await Promise.all(databases.map(db => terminate(db)));
  await Promise.all(apps.map(app => deleteApp(app)));
}
