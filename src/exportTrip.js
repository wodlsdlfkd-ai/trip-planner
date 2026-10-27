import ExcelJS from 'exceljs';
import { CATEGORY_LABELS, PAYMENT_LABELS, getReportData, tripDate, reportFilename } from './tripReport.js';

const blue = 'FF2563EB';
const font = { name: '맑은 고딕', size: 11, color: { argb: 'FF1F2937' } };
const integerFormat = '#,##0;[Red](#,##0);–';
const decimalFormat = '#,##0.########;[Red](#,##0.########);–';
const formula = (expression, result) => ({ formula: expression, result });

export async function createTripWorkbook(trip) {
  const report = getReportData(trip);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Trip Planner';
  workbook.calcProperties.fullCalcOnLoad = true;
  const summary = workbook.addWorksheet('여행 요약', { views: [{ showGridLines: false }] });
  const detail = workbook.addWorksheet('일정·지출', { views: [{ state: 'frozen', ySplit: 4, xSplit: 2, showGridLines: false }] });
  summary.columns = [{ width: 25 }, { width: 25 }, { width: 4 }, { width: 22 }, { width: 23 }, { width: 15 }];
  detail.columns = [12, 8, 15, 12, 26, 12, 30, 12, 24, 18, 12, 18, 20, 65].map(width => ({ width }));
  for (const sheet of [summary, detail]) {
    sheet.properties.defaultRowHeight = 22;
    sheet.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  summary.mergeCells('A1:F1');
  summary.getCell('A1').value = `${trip.config.country} 여행 일정·지출`;
  detail.mergeCells('A1:N1');
  detail.getCell('A1').value = `${trip.config.country} · 전체 일정과 지출`;
  summary.mergeCells('A2:F2');
  summary.getCell('A2').value = '출처: 트립 플래너 저장 자료 · 다운로드 시점의 일정과 비용';
  detail.mergeCells('A2:N2');
  detail.getCell('A2').value = '준비 비용은 원화, 여행 중 비용은 현지화입니다. 환율은 여행 설정값을 사용합니다. 0원 일정도 포함합니다.';
  const headers = ['구분', '일차', '날짜', '시간', '숙소', '분류', '항목명', '결제수단', '결제 상세', '입력 금액', '금액 단위', '적용 환율', '원화 환산액', '메모'];
  detail.getRow(4).values = headers;
  report.rows.forEach((item, index) => {
    const r = index + 5;
    detail.addRow([item.period, item.day, item.date, item.time, item.hotel, item.category, item.title, item.payment, item.paymentDetail, item.cost, item.unit, item.rate,
      formula(`IF(A${r}="준비",J${r},INT(J${r}*L${r}))`, item.krw), item.memo]);
    const lineCount = Math.max(1, ...[item.title, item.hotel, item.memo, item.paymentDetail].map(text => text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(Array.from(line).length / 30)), 0)));
    detail.getRow(r).height = 20 * lineCount + 8;
  });
  const last = Math.max(5, report.rows.length + 4);
  detail.autoFilter = { from: 'A4', to: `N${last}` };
  detail.getColumn(3).numFmt = 'yyyy-mm-dd';
  detail.getColumn(10).numFmt = decimalFormat;
  detail.getColumn(12).numFmt = decimalFormat;
  detail.getColumn(13).numFmt = integerFormat;
  summary.getCell('A4').value = '여행명'; summary.getCell('B4').value = String(trip.config.country || '');
  summary.getCell('A5').value = '시작일'; summary.getCell('B5').value = tripDate(trip.config.startDate); summary.getCell('B5').numFmt = 'yyyy-mm-dd';
  summary.getCell('D4').value = '여행 기간(일)'; summary.getCell('E4').value = Number(trip.config.duration);
  summary.getCell('D5').value = '현지화 1단위당 원화'; summary.getCell('E5').value = report.rate; summary.getCell('E5').numFmt = decimalFormat;
  const range = column => `'일정·지출'!${column}5:${column}${last}`;
  const metrics = [
    ['준비 비용 (원)', formula(`SUMIF(${range('A')},"준비",${range('J')})`, report.preparation)],
    ['여행 중 금액 (현지화)', formula(`SUMIF(${range('A')},"여행 중",${range('J')})`, report.local)],
    ['여행 중 환산액 (원)', formula('INT(B9*$E$5)', report.converted)],
    ['전체 합계 (원)', formula('SUM(B8,B10)', report.total)],
    ['환산 조정액 (원)', formula(`B11-SUM(${range('M')})`, report.adjustment)],
  ];
  metrics.forEach(([label, value], index) => { summary.getCell(`A${index + 8}`).value = label; summary.getCell(`B${index + 8}`).value = value; summary.getCell(`B${index + 8}`).numFmt = index === 1 ? decimalFormat : integerFormat; });
  summary.mergeCells('A14:F15');
  summary.getCell('A14').value = '전체 합계는 앱과 동일하게 여행 중 현지화 합계 × 환율의 원 미만을 버린 뒤 준비 비용을 더합니다.\n분류별·결제수단별 집계는 각 항목의 원화 환산액 기준이며, 행별 절사 차이는 환산 조정액으로 표시합니다.';
  summary.getRow(14).height = 30;
  summary.getCell('A17').value = '분류'; summary.getCell('B17').value = '원화 환산액';
  summary.getCell('D17').value = '결제수단'; summary.getCell('E17').value = '원화 환산액';
  const breakdown = (labels, labelColumn, valueColumn, sourceColumn) => labels.forEach((label, i) => {
    const row = 18 + i;
    summary.getCell(`${labelColumn}${row}`).value = label;
    const value = report.rows.filter(item => (sourceColumn === 'F' ? item.category : item.payment) === label).reduce((sum, item) => sum + item.krw, 0);
    summary.getCell(`${valueColumn}${row}`).value = formula(`SUMIF(${range(sourceColumn)},${labelColumn}${row},${range('M')})`, value);
    summary.getCell(`${valueColumn}${row}`).numFmt = integerFormat;
  });
  breakdown(Object.values(CATEGORY_LABELS), 'A', 'B', 'F');
  breakdown(Object.values(PAYMENT_LABELS), 'D', 'E', 'H');
  for (const sheet of [summary, detail]) {
    sheet.eachRow(row => row.eachCell(cell => { cell.font = font; cell.alignment = { vertical: 'top', wrapText: true }; }));
    sheet.getRow(1).height = 36;
    sheet.getCell('A1').font = { ...font, size: 19, bold: true, color: { argb: blue } };
    sheet.getRow(2).height = 34;
    sheet.getCell('A2').font = { ...font, size: 10, color: { argb: 'FF6B7280' } };
  }
  for (const cell of ['A17', 'B17', 'D17', 'E17']) {
    summary.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } };
    summary.getCell(cell).font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
  }
  detail.getRow(4).eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: blue } }; cell.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } }; });
  for (const cell of ['A11', 'B11']) { summary.getCell(cell).font = { ...font, size: 14, bold: true, color: { argb: blue } }; }
  summary.getRow(11).height = 30;
  return { workbook, filename: reportFilename(trip), report };
}

export async function downloadTripExcel(trip) {
  const { workbook, filename } = await createTripWorkbook(trip);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
