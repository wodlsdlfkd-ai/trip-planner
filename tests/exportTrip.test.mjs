import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createTripWorkbook } from '../src/exportTrip.js';
import { getReportData, tripDate } from '../src/tripReport.js';

const trip = () => ({ config: { country: '가족/여행:테스트', startDate: '2026-01-31', duration: 2, currencyRate: 1.6 }, preparation: { schedule: [{ id: 'p', title: '=1+1', time: '-', type: 'flight', cost: 100, memo: '첫 줄\n둘째 줄' }] }, days: [
  { id: 'a', dayNum: 1, hotel: '한글 숙소', schedule: [{ id: '1', time: '09:00', type: 'meal', title: '식사', cost: 1, paymentMethod: 'cash', paymentDetail: '현금 지갑', memo: '' }] },
  { id: 'b', dayNum: 2, hotel: '', schedule: [{ id: '2', time: '', type: 'activity', title: '+원본 텍스트', cost: 1, memo: '줄바꿈\n메모' }, { id: '3', time: '10:00', type: 'etc', title: '무료 일정', cost: 0 }] },
] });

test('preserves every row and reconciles aggregate rounding', () => {
  const input = trip(); const copy = structuredClone(input);
  const report = getReportData(input);
  assert.equal(report.rows.length, 4);
  assert.equal(report.total, 103);
  assert.equal(report.adjustment, 1);
  assert.deepEqual(input, copy);
  assert.equal(tripDate('2026-01-31', 1).toISOString(), '2026-02-01T00:00:00.000Z');
});

test('xlsx round trip preserves numbers, dates, formulas, newlines and literal user text', async () => {
  const { workbook, filename } = await createTripWorkbook(trip());
  const saved = await workbook.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(saved);
  assert.equal(loaded.worksheets.length, 2);
  const detail = loaded.getWorksheet('일정·지출');
  assert.equal(detail.actualRowCount, 7); // Title, note, header, four data rows; blank row 3 is not counted.
  assert.equal(detail.getCell('G5').value, '=1+1');
  assert.equal(detail.getCell('G7').value, '+원본 텍스트');
  assert.equal(detail.getCell('N5').value, '첫 줄\n둘째 줄');
  assert.equal(detail.getCell('J8').value, 0);
  assert.ok(detail.getCell('C6').value instanceof Date);
  assert.equal(detail.getCell('L6').value, 1.6);
  assert.equal(loaded.getWorksheet('여행 요약').getCell('B11').value.result, 103);
  assert.equal(loaded.getWorksheet('여행 요약').getCell('B12').value.result, 1);
  assert.ok(!filename.includes('/')); assert.ok(!filename.includes(':'));
  assert.equal(detail.views[0].state, 'frozen');
  assert.ok(detail.autoFilter);
});

test('empty schedule exports a valid workbook with zero total', async () => {
  const input = { config: { country: '', startDate: '2026-05-01', duration: 1, currencyRate: 10 }, days: [] };
  const { workbook, report, filename } = await createTripWorkbook(input);
  assert.equal(report.rows.length, 0); assert.equal(report.total, 0);
  assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 0);
  assert.ok(filename.startsWith('여행_'));
});
