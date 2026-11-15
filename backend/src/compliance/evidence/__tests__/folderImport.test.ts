import { detectCode, isIgnoredFile } from '../folderImport';
import { parseCitation } from '../../library/library';

describe('folder import: reading codes from paths', () => {
  it.each([
    ['ملفات قياس 2026/5.3 البنية المؤسسية/5.3.2/5.3.2.7 الوضع المستقبلي لبنية التقنية.pdf', '5.3.2.7', 'requirement'],
    ['5.6 بناء الكفاءات/5.6.1/Copy of 5.6.1.1.pdf', '5.6.1.1', 'requirement'],
    ['5.7 إجراءات العمل/5.7.4/5.7.4.3/متابعة وقياس مؤشرات الأداء.pdf', '5.7.4.3', 'requirement'],
    ['5.12/5.12.3/5.12.3.2/5.12.3.2', '5.12.3.2', 'requirement'],
    ['5.2 حوكمة التحول الرقمي/5.2.3/Screenshot 2026-09-01 124430.png', '5.2.3', 'standard'],
    ['5.12/5.12.1/5.12.1.6/Screenshot 1447-12-04 at 10.09.40 AM.png', '5.12.1.6', 'requirement'],
    ['5.18 مشاركة المستفيد/لقطة شاشة 4.png', '5.18', 'axis'],
    ['5.10 استمرارية الأعمال/Copy of خطط استمرارية الأعمال V2.0.pdf', '5.10', 'axis'],
    ['5.3 البنية المؤسسية/5.3.3/امتثال المبادرات 5.3.3.2.pptx', '5.3.3.2', 'requirement'],
  ])('%s → %s', (p, code, level) => {
    expect(detectCode(p)).toEqual({ code, level });
  });

  it('finds nothing in names without codes', () => {
    expect(detectCode('قياس 2026/عرض التوعية الرقمية.docx')).toBeNull();
  });

  it('ignores system and shortcut files', () => {
    expect(isIgnoredFile('5.1/.DS_Store')).toBe(true);
    expect(isIgnoredFile('5.1/~$draft.docx')).toBe(true);
    expect(isIgnoredFile('5.1/Thumbs.db')).toBe(true);
    expect(isIgnoredFile('5.13/Systems list.lnk')).toBe(true);
    expect(isIgnoredFile('5.1/5.1.1.1.pdf')).toBe(false);
  });
});

describe('library: reading citations', () => {
  it('reads a Royal Court circular with its clause', () => {
    expect(parseCitation({ ar: 'تعميم الديوان الملكي رقم (6262) وتاريخ 26/1/1445هـ، البند (19).', en: 'Royal Court Circular No. (6262) dated 26/1/1445H, Clause (19).' }))
      .toMatchObject({ kind: 'circular', titleAr: 'تعميم الديوان الملكي رقم (6262) وتاريخ 26/1/1445هـ', titleEn: 'Royal Court Circular No. (6262) dated 26/1/1445H', issuedOn: '26/1/1445هـ', detail: 'البند (19)' });
  });

  it('gives the same code to the same instrument however it is written', () => {
    const a = parseCitation({ ar: 'تعميم هيئة الحكومة الرقمية الصادر برقم (955) وتاريخ 28/1/1443هـ.' });
    const b = parseCitation({ ar: 'تعميم هيئة الحكومة الرقمية رقم (955) وتاريخ 28/1/1443هـ.' });
    const c = parseCitation({ ar: 'تعميم معالي وزير المالية رقم (46973) وتاريخ 05/12/1443هـ.' });
    const d = parseCitation({ ar: 'تعميم معالي وزير المالية رقم (46973) وتاريخ 5/12/1443هـ.' });
    expect(a!.code).toBe(b!.code);
    expect(c!.code).toBe(d!.code);
    expect(a!.code).not.toBe(c!.code);
  });

  it('recognizes decisions, royal orders, decrees and laws', () => {
    expect(parseCitation({ ar: 'قرار مجلس الوزراء رقم (40) وتاريخ 27/2/1427هـ، البند (16).' })!.kind).toBe('decision');
    expect(parseCitation({ ar: 'الأمر السامي رقم (8189/م ب) وتاريخ 19/6/1426هـ.' })).toMatchObject({ kind: 'royal_order', titleAr: 'الأمر السامي رقم (8189/م ب) وتاريخ 19/6/1426هـ' });
    expect(parseCitation({ ar: 'المرسوم الملكي رقم (م/128) وتاريخ 13/11/1440هـ.' })!.kind).toBe('royal_decree');
    expect(parseCitation({ ar: 'نظام حقوق الأشخاص ذوي الإعاقة الصادر بالمرسوم الملكي رقم (م/27) وتاريخ 11/2/1445هـ.' })!.kind).toBe('law');
  });

  it('returns null for text that names no numbered instrument', () => {
    expect(parseCitation({ ar: 'أفضل الممارسات الدولية.' })).toBeNull();
  });
});
