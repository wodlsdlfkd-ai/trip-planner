import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performTripAction, validateConfig, validateItem, TripError } from '../server/tripService.js';
import { createTripHandler } from '../server/tripHandler.js';

const code = 'test-family-code';
const config = { country: '테스트 여행', startDate: '2026-12-31', duration: 2, currencyRate: 12.5 };
function memoryStore() {
  const documents = new Map();
  return { documents, transaction: async (id, operation) => {
    const current = documents.get(id);
    const { next, result } = operation(current ? structuredClone(current) : null);
    if (next) documents.set(id, structuredClone(next));
    return result;
  } };
}
async function seeded() {
  const store = memoryStore();
  const body = { action: 'create', requestId: '0123456789-test-travel-request', config };
  const created = await performTripAction(body, code, 'user-a', store);
  return { store, created, body };
}
const errorCode = code => error => error instanceof TripError && error.code === code;

test('creates separate days and supports an idempotent create retry', async () => {
  const { store, created, body } = await seeded();
  const original = structuredClone(store.documents.get(created.tripId));
  assert.equal(original.days.length, 2); assert.equal(original.days[0].schedule.length, 3);
  assert.notEqual(original.days[0].id, original.days[1].id);
  assert.deepEqual(await performTripAction(body, code, 'user-a', store), created);
  assert.deepEqual(store.documents.get(created.tripId), original);
  await assert.rejects(() => performTripAction(body, 'other-group', 'user-b', store), errorCode('forbidden'));
});

test('validates dates, integer duration, exchange rate, cost and time', () => {
  for (const change of [{ startDate: '2026-02-30' }, { duration: 0 }, { duration: 1.5 }, { duration: 91 }, { currencyRate: 0 }, { currencyRate: NaN }, { country: ' ' }]) {
    assert.throws(() => validateConfig({ ...config, ...change }), errorCode('invalid-input'));
  }
  const item = { title: '식사', type: 'meal', time: '09:00', cost: 1 };
  for (const change of [{ cost: -1 }, { cost: Infinity }, { time: '25:00' }, { type: 'unknown' }, { title: '' }]) {
    assert.throws(() => validateItem({ ...item, ...change }, false), errorCode('invalid-input'));
  }
});

test('concurrent stale edits fail without overwriting the first save', async () => {
  const { store, created } = await seeded();
  const original = store.documents.get(created.tripId);
  const dayId = original.days[0].id;
  await performTripAction({ action: 'saveHotel', tripId: created.tripId, dayId, hotel: '저장된 숙소', expectedVersion: created.version }, code, 'user-a', store);
  await assert.rejects(() => performTripAction({ action: 'saveHotel', tripId: created.tripId, dayId, hotel: '오래된 화면', expectedVersion: created.version }, code, 'user-b', store), errorCode('conflict'));
  assert.equal(store.documents.get(created.tripId).days[0].hotel, '저장된 숙소');
});

test('saves and sorts one item, preserving other items and legacy preparation rows', async () => {
  const { store, created } = await seeded();
  const original = store.documents.get(created.tripId);
  original.preparation.schedule.push({ title: 'ID 없는 준비 항목', type: 'hotel', cost: 10, time: '-' });
  const first = original.days[0].schedule[0];
  const saved = await performTripAction({ action: 'saveItem', tripId: created.tripId, dayId: original.days[0].id, itemId: first.id, expectedVersion: created.version, item: { ...first, time: '13:00', memo: '첫줄\n둘째줄' } }, code, 'user-a', store);
  const changed = store.documents.get(created.tripId);
  assert.deepEqual(changed.days[0].schedule.map(item => item.time), ['12:00', '13:00', '18:00']);
  const legacy = changed.preparation.schedule[1];
  const savedLegacy = await performTripAction({ action: 'saveItem', tripId: created.tripId, dayId: 'preparation', itemId: 'legacy-preparation-1', expectedVersion: saved.version, item: { ...legacy, title: '수정한 준비 항목' } }, code, 'user-a', store);
  assert.ok(savedLegacy.version !== saved.version);
  assert.equal(store.documents.get(created.tripId).preparation.schedule[1].title, '수정한 준비 항목');
  assert.ok(store.documents.get(created.tripId).preparation.schedule[1].id);
  assert.equal(store.documents.get(created.tripId).preparation.schedule.length, 2);
});

test('rejects other-group IDs, missing versions and delete actions', async () => {
  const { store, created } = await seeded();
  await assert.rejects(() => performTripAction({ action: 'saveConfig', tripId: created.tripId, expectedVersion: created.version, config }, 'other-group', 'user-a', store), errorCode('forbidden'));
  await assert.rejects(() => performTripAction({ action: 'saveConfig', tripId: created.tripId, config }, code, 'user-a', store), errorCode('version-required'));
  await assert.rejects(() => performTripAction({ action: 'delete', tripId: created.tripId }, code, 'user-a', store), errorCode('invalid-action'));
});

test('import saves a batch atomically and a retry never creates duplicates', async () => {
  const { store, created } = await seeded();
  const dayId = store.documents.get(created.tripId).days[1].id;
  const body = { action: 'importItems', tripId: created.tripId, expectedVersion: created.version, requestId: '0123456789-import-test-request', items: [
    { dayId, item: { title: '예약', time: '10:30', type: 'activity', cost: 100, memo: '' } },
    { dayId: 'preparation', item: { title: '항공권', type: 'flight', cost: 200, memo: '' } },
  ] };
  const saved = await performTripAction(body, code, 'user-a', store);
  assert.equal(saved.imported, 2);
  const state = structuredClone(store.documents.get(created.tripId));
  assert.equal(state.days[1].schedule.filter(item => item.title === '예약').length, 1);
  assert.equal(state.preparation.schedule.filter(item => item.title === '항공권').length, 1);
  await performTripAction(body, code, 'user-a', store);
  assert.deepEqual(store.documents.get(created.tripId), state);
  await assert.rejects(() => performTripAction({ ...body, requestId: '0123456789-import-other-request' }, code, 'user-a', store), errorCode('conflict'));
  assert.deepEqual(store.documents.get(created.tripId), state);
});

async function request({ method = 'POST', body = { action: 'capabilities', shareCode: code }, headers = {}, configured = true, tokenFails = false, limited = false } = {}) {
  const handler = createTripHandler(async () => {
    if (!configured) throw new TripError(503, 'editing-unavailable', '준비 중');
    return { codeHash: createHash('sha256').update(code).digest('hex'), store: memoryStore(), rateLimit: async () => { if (limited) throw new TripError(429, 'rate-limited', '요청 제한'); }, verifyToken: async () => { if (tokenFails) throw Error('bad token'); return { uid: 'user-a' }; } };
  });
  const result = { headers: {} };
  const res = { setHeader: (key, value) => result.headers[key] = value, status: status => { result.status = status; return res; }, json: data => result.data = data };
  await handler({ method, body, headers: { authorization: 'Bearer fixture-token', host: 'example.test', ...headers } }, res);
  return result;
}

test('HTTP authentication and code validation gate every capability/write request', async () => {
  assert.equal((await request()).status, 200);
  assert.equal((await request({ body: { action: 'capabilities', shareCode: 'wrong' } })).status, 403);
  assert.equal((await request({ headers: { authorization: '' } })).status, 401);
  assert.equal((await request({ tokenFails: true })).status, 401);
  assert.equal((await request({ headers: { origin: 'https://wrong.test' } })).status, 403);
  assert.equal((await request({ method: 'GET' })).status, 405);
  assert.equal((await request({ configured: false })).status, 503);
  assert.equal((await request({ limited: true })).status, 429);
  assert.equal((await request({ body: { action: 'delete', shareCode: code } })).status, 400);
});
