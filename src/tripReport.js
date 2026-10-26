export const CATEGORY_LABELS = { meal: '식사', coffee: '카페', activity: '관광', transport: '이동', shopping: '쇼핑', hotel: '숙소', flight: '항공', money: '비용', etc: '기타' };
export const PAYMENT_LABELS = { card: '카드', cash: '현금', other: '기타' };

const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function tripDate(startDate, offset = 0) {
  const date = new Date(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

export function getReportData(trip) {
  const rate = amount(trip.config.currencyRate);
  const rows = [];
  const add = (item, day, index, isPreparation) => {
    const cost = amount(item.cost);
    rows.push({
      period: isPreparation ? '준비' : '여행 중', day: isPreparation ? 0 : (day.dayNum ?? index + 1),
      date: isPreparation ? null : tripDate(trip.config.startDate, index),
      time: String(item.time || ''), hotel: isPreparation ? '' : String(day.hotel || ''),
      category: CATEGORY_LABELS[item.type] || '기타', title: String(item.title || ''),
      payment: PAYMENT_LABELS[item.paymentMethod] || '카드', paymentDetail: String(item.paymentDetail || ''),
      cost, unit: isPreparation ? 'KRW' : '현지화', rate: isPreparation ? 1 : rate,
      krw: isPreparation ? cost : Math.floor(cost * rate), memo: String(item.memo || ''),
    });
  };
  (trip.preparation?.schedule || []).forEach(item => add(item, null, 0, true));
  (trip.days || []).forEach((day, index) => (day.schedule || []).forEach(item => add(item, day, index, false)));
  const preparation = rows.filter(row => row.period === '준비').reduce((sum, row) => sum + row.cost, 0);
  const local = rows.filter(row => row.period === '여행 중').reduce((sum, row) => sum + row.cost, 0);
  const converted = Math.floor(local * rate);
  const total = preparation + converted;
  return { rows, rate, preparation, local, converted, total, adjustment: total - rows.reduce((sum, row) => sum + row.krw, 0) };
}

export function reportFilename(trip) {
  const safe = value => Array.from(String(value || '')).filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '').slice(0, 80);
  return `${safe(trip.config.country) || '여행'}_${safe(trip.config.startDate) || '날짜미정'}_일정및지출.xlsx`;
}
