import { randomUUID } from 'node:crypto';

export class TripError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (code, message, status = 400) => { throw new TripError(status, code, message); };
const text = (value, name, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('invalid-input', `${name} 값을 확인해 주세요.`);
  return required ? value.trim() : value;
};
const number = (value, name, positive = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive && value === 0) || value > 1e12) fail('invalid-input', `${name} 값을 확인해 주세요.`);
  return value;
};
export function validateConfig(input) {
  if (!input || typeof input !== 'object') fail('invalid-input', '여행 설정을 확인해 주세요.');
  const country = text(input.country, '여행명', 100, true);
  const startDate = text(input.startDate, '시작일', 10, true);
  const parsed = new Date(`${startDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== startDate) fail('invalid-input', '유효한 시작일을 입력해 주세요.');
  if (!Number.isInteger(input.duration) || input.duration < 1 || input.duration > 90) fail('invalid-input', '여행 기간은 1~90일의 정수로 입력해 주세요.');
  const currencyRate = number(input.currencyRate, '환율', true);
  return { country, startDate, duration: input.duration, currencyRate };
}
export function validateItem(input, preparation) {
  if (!input || typeof input !== 'object') fail('invalid-input', '일정 항목을 확인해 주세요.');
  const title = text(input.title, '항목명', 300, true);
  const time = text(input.time ?? '', '시간', 5);
  if (!preparation && time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('invalid-input', '시간 형식을 확인해 주세요.');
  if (!['meal', 'coffee', 'activity', 'transport', 'shopping', 'hotel', 'flight', 'money', 'etc'].includes(input.type)) fail('invalid-input', '분류를 확인해 주세요.');
  const paymentMethod = input.paymentMethod || 'card';
  if (!['card', 'cash', 'other'].includes(paymentMethod)) fail('invalid-input', '결제수단을 확인해 주세요.');
  return { title, time: preparation ? '-' : time, type: input.type, cost: number(input.cost, '비용'), memo: text(input.memo ?? '', '메모', 10000), paymentMethod, paymentDetail: text(input.paymentDetail ?? '', '결제 상세', 300) };
}
export const versionOf = trip => trip.updatedAt || trip.createdAt || null;
export const identityOf = (item, index, dayId) => item.id ?? `legacy-${dayId}-${index}`;

export async function performTripAction(body, code, uid, store) {
  const { action } = body;
  if (action === 'capabilities') return { editingEnabled: true };
  if (action === 'create') {
    const config = validateConfig(body.config);
    const requestId = text(body.requestId, '요청 ID', 80, true);
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(requestId)) fail('invalid-input', '요청 ID를 확인해 주세요.');
    return store.transaction(requestId, current => {
      if (current) {
        if (current.shareCode !== code || current.createdBy !== uid) fail('forbidden', '접근할 수 없는 여행입니다.', 403);
        return { result: { tripId: requestId, version: versionOf(current) } };
      }
      const now = new Date().toISOString();
      const next = { shareCode: code, config, createdAt: now, updatedAt: now, createdBy: uid,
        preparation: { schedule: [{ id: randomUUID(), time: '-', title: '항공권 예매', type: 'flight', cost: 0, memo: '' }] },
        days: Array.from({ length: config.duration }, (_, index) => ({ id: randomUUID(), dayNum: index + 1, hotel: '', schedule: [
          { id: randomUUID(), time: '08:00', title: '아침 식사', type: 'meal', cost: 0, memo: '' },
          { id: randomUUID(), time: '12:00', title: '점심 식사', type: 'meal', cost: 0, memo: '' },
          { id: randomUUID(), time: '18:00', title: '저녁 식사', type: 'meal', cost: 0, memo: '' },
        ] })),
      };
      return { next, result: { tripId: requestId, version: now } };
    });
  }
  if (!['saveItem', 'saveHotel', 'saveConfig', 'importItems'].includes(action)) fail('invalid-action', '지원하지 않는 작업입니다.');
  const tripId = text(body.tripId, '여행 ID', 100, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(tripId)) fail('invalid-input', '여행 ID를 확인해 주세요.');
  if (!Object.hasOwn(body, 'expectedVersion')) fail('version-required', '여행을 다시 열어 주세요.', 409);
  return store.transaction(tripId, current => {
    if (!current || current.shareCode !== code) fail('forbidden', '접근할 수 없는 여행입니다.', 403);
    if (action === 'importItems') {
      const requestId = text(body.requestId, '요청 ID', 80, true);
      if (!/^[a-zA-Z0-9-]{20,80}$/.test(requestId)) fail('invalid-input', '요청 ID를 확인해 주세요.');
      const existingImport = current.importRequests?.[requestId];
      if (existingImport) {
        if (existingImport.uid !== uid) fail('forbidden', '접근할 수 없는 요청입니다.', 403);
        return { result: { tripId, version: versionOf(current), imported: existingImport.count } };
      }
    }
    if (versionOf(current) !== body.expectedVersion) fail('conflict', '다른 변경이 먼저 저장되었습니다. 입력 내용은 남아 있습니다. 취소 후 다시 열어 최신 내용을 확인해 주세요.', 409);
    const next = structuredClone(current);
    if (action === 'importItems') {
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 30) fail('invalid-input', '저장할 항목은 1~30개여야 합니다.');
      for (const entry of body.items) {
        const prep = entry.dayId === 'preparation';
        const target = prep ? (next.preparation ||= { schedule: [] }) : next.days.find(day => day.id === entry.dayId);
        if (!target) fail('invalid-input', '일차를 확인해 주세요.');
        target.schedule ||= [];
        const item = validateItem(entry.item, prep);
        target.schedule.push({ ...item, id: randomUUID(), dayId: entry.dayId });
        if (!prep) target.schedule.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
      }
      next.importRequests ||= {};
      if (Object.keys(next.importRequests).length >= 1000) fail('invalid-input', '가져오기 기록이 가득 찼습니다.');
      next.importRequests[body.requestId] = { uid, count: body.items.length };
    } else if (action === 'saveConfig') {
      const config = validateConfig(body.config);
      if (config.duration !== current.config.duration) fail('invalid-input', '기존 여행의 기간 변경은 지원하지 않습니다.');
      next.config = config;
    } else if (action === 'saveHotel') {
      const day = next.days.find(day => day.id === body.dayId);
      if (!day) fail('invalid-input', '일차를 확인해 주세요.');
      day.hotel = text(body.hotel, '숙소', 300);
    } else {
      const prep = body.dayId === 'preparation';
      const target = prep ? (next.preparation ||= { schedule: [] }) : next.days.find(day => day.id === body.dayId);
      if (!target) fail('invalid-input', '일차를 확인해 주세요.');
      target.schedule ||= [];
      const item = validateItem(body.item, prep);
      const index = target.schedule.findIndex((entry, index) => identityOf(entry, index, body.dayId) === body.itemId);
      if (body.isNew !== true && index < 0) fail('conflict', '항목을 다시 열어 주세요.', 409);
      if (body.isNew === true && index >= 0) fail('conflict', '이미 저장된 항목입니다.', 409);
      const saved = { ...(index >= 0 ? target.schedule[index] : {}), ...item, id: index >= 0 ? (target.schedule[index].id ?? randomUUID()) : randomUUID(), dayId: body.dayId };
      if (index >= 0) target.schedule[index] = saved;
      else target.schedule.push(saved);
      if (!prep) target.schedule.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    }
    // Version strings must change even when two writes occur within one millisecond.
    const previous = Date.parse(versionOf(current)) || 0;
    next.updatedAt = new Date(Math.max(Date.now(), previous + 1)).toISOString();
    return { next, result: { tripId, version: next.updatedAt, ...(action === 'importItems' ? { imported: body.items.length } : {}) } };
  });
}
