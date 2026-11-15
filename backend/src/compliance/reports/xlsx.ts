/**
 * Excel export of a rendered report: a cover sheet (title, cycle, "data as of",
 * summary) and one sheet per section. Arabic and Urdu sheets read right to left.
 */
import ExcelJS from 'exceljs';
import type { RenderedReport } from './reports';

const COVER: Record<RenderedReport['lang'], { cycle: string; asOf: string; summary: string }> = {
  ar: { cycle: 'الدورة', asOf: 'البيانات حتى', summary: 'الملخص' },
  en: { cycle: 'Cycle', asOf: 'Data as of', summary: 'Summary' },
  ur: { cycle: 'دور', asOf: 'ڈیٹا بمطابق', summary: 'خلاصہ' },
};

/** Sheet names: at most 31 characters, none of : \ / ? * [ ] and unique. */
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Sheet';
  let name = base;
  for (let i = 2; used.has(name); i += 1) name = `${base.slice(0, 26)} ${i}`;
  used.add(name);
  return name;
}

function cellValue(v: unknown, type: string): ExcelJS.CellValue {
  if (v === null || v === undefined || v === '') return null;
  if (type === 'date' || type === 'datetime') return new Date(String(v));
  if (type === 'percent') return Number(v) / 100;
  if (type === 'number') return Number(v);
  return String(v);
}

export async function reportToXlsx(r: RenderedReport, utcOffsetMinutes = 180): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Qiyas';
  wb.created = new Date(r.asOf);
  const rtl = r.lang !== 'en';
  const used = new Set<string>();
  // Excel has no time zones: write local (Riyadh) wall-clock times
  const local = (d: Date) => new Date(d.getTime() + utcOffsetMinutes * 60_000);

  const cover = wb.addWorksheet(sheetName(COVER[r.lang].summary, used), { views: [{ rightToLeft: rtl }] });
  cover.columns = [{ width: 42 }, { width: 48 }];
  cover.addRow([r.title]).font = { bold: true, size: 16 };
  if (r.subtitle) cover.addRow([r.subtitle]);
  cover.addRow([COVER[r.lang].cycle, r.cycle?.name ?? '']);
  const asOf = cover.addRow([COVER[r.lang].asOf, local(new Date(r.asOf))]);
  asOf.getCell(2).numFmt = 'yyyy-mm-dd hh:mm';
  cover.addRow([]);
  for (const s of r.summary) {
    const row = cover.addRow([s.label, cellValue(s.value, s.type)]);
    row.getCell(1).font = { bold: true };
    if (s.type === 'percent') row.getCell(2).numFmt = '0.0%';
  }

  for (const sec of r.sections) {
    const ws = wb.addWorksheet(sheetName(sec.title, used), { views: [{ rightToLeft: rtl, state: 'frozen', ySplit: sec.note ? 2 : 1 }] });
    if (sec.note) ws.addRow([sec.note]).font = { italic: true };
    const head = ws.addRow(sec.columns.map((c) => c.label));
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5A5A' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
    for (const row of sec.rows) {
      const added = ws.addRow(sec.columns.map((c) => {
        const v = cellValue(row[c.key], c.type);
        return v instanceof Date ? local(v) : v;
      }));
      sec.columns.forEach((c, i) => {
        const cell = added.getCell(i + 1);
        if (c.type === 'percent') cell.numFmt = '0.0%';
        else if (c.type === 'datetime') cell.numFmt = 'yyyy-mm-dd hh:mm';
        else if (c.type === 'date') cell.numFmt = 'yyyy-mm-dd';
        else if (c.type === 'text') cell.alignment = { wrapText: true, vertical: 'top' };
      });
    }
    ws.columns.forEach((col, i) => {
      const c = sec.columns[i];
      const longest = Math.max(c.label.length, ...sec.rows.slice(0, 200).map((r2) => String(r2[c.key] ?? '').length));
      col.width = c.type === 'datetime' ? 17 : Math.min(Math.max(10, longest + 2), c.type === 'text' ? 60 : 24);
    });
    ws.autoFilter = { from: { row: sec.note ? 2 : 1, column: 1 }, to: { row: sec.note ? 2 : 1, column: sec.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
