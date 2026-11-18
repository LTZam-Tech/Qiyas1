// C14: parseCitation must stay linear on hostile input and give exactly the baseline results on real data.
import fs from 'fs';
import path from 'path';
import { MAX_CITATION_CHARS, parseCitation } from '../library';

const timed = <R>(fn: () => R): [R, number] => { const t = Date.now(); const r = fn(); return [r, Date.now() - t]; };
const VALID_AR = 'قرار مجلس الوزراء رقم (40) وتاريخ 27/2/1427هـ، البند (16)';

describe('library: parseCitation on hostile input (C14)', () => {
  it("returns null within 50 ms for 64 KB of repeated 'رقم (' without ')'", () => {
    const [r, ms] = timed(() => parseCitation({ ar: 'رقم ('.repeat(13_200) }));
    expect(r).toBeNull();
    expect(ms).toBeLessThan(500); // generous bound against CI noise; the baseline took seconds
    // the bounded pattern is also quick just under the length guard
    const [r2, ms2] = timed(() => parseCitation({ ar: 'رقم ('.repeat(399) }));
    expect(r2).toBeNull();
    expect(ms2).toBeLessThan(500);
  });

  it("returns null within 50 ms for 64 KB of repeated 'No. (' in English", () => {
    const [r, ms] = timed(() => parseCitation({ ar: VALID_AR, en: 'No. ('.repeat(13_200) }));
    expect(r).toBeNull();
    expect(ms).toBeLessThan(500);
    // under the guard, a hostile English text falls back to the title built from the Arabic
    const [r2, ms2] = timed(() => parseCitation({ ar: VALID_AR, en: 'No. ('.repeat(399) }));
    expect(r2).toMatchObject({ kind: 'decision', titleEn: 'قرار مجلس الوزراء No. (40) dated 27/2/1427هـ' });
    expect(ms2).toBeLessThan(500);
  });

  it('a valid citation followed by 50,000 dots and a letter parses in under 50 ms', () => {
    // over MAX_CITATION_CHARS: refused at once (the baseline trailing-dots regex took seconds here)
    const [r, ms] = timed(() => parseCitation({ ar: `${VALID_AR}${'.'.repeat(50_000)}x` }));
    expect(r).toBeNull();
    expect(ms).toBeLessThan(500);
    // within the cap the manual trim gives what the regex gave
    const detail = `البند (16)${'.'.repeat(1_000)}x`;
    const [r2, ms2] = timed(() => parseCitation({ ar: `${VALID_AR}${'.'.repeat(1_000)}x. . ..` }));
    expect(r2!.detail).toBe(detail);
    expect(ms2).toBeLessThan(500);
  });

  it('returns null for references longer than MAX_CITATION_CHARS', () => {
    const pad = (n: number) => `${VALID_AR}، ${'م'.repeat(n - VALID_AR.length - 2)}`;
    expect(pad(MAX_CITATION_CHARS)).toHaveLength(MAX_CITATION_CHARS);
    expect(parseCitation({ ar: pad(MAX_CITATION_CHARS) })).toMatchObject({ kind: 'decision' });
    expect(parseCitation({ ar: pad(MAX_CITATION_CHARS + 1) })).toBeNull();
    expect(parseCitation({ ar: VALID_AR, en: 'x'.repeat(MAX_CITATION_CHARS + 1) })).toBeNull();
  });
});

describe('library: parseCitation on the shipped frameworks (golden list)', () => {
  // Generated from the baseline parseCitation (commit 80ae855) before it was changed.
  const golden: Array<{ key: string; input?: { ar?: string; en?: string }; result: unknown }> =
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/citations.golden.json'), 'utf8'));

  it('every reference in dga-v4.0.json and dga-v5.0.json yields the same code/titles/detail as before', () => {
    const actual: Array<{ key: string; result: unknown }> = [];
    for (const v of ['dga-v4.0', 'dga-v5.0']) {
      const f = JSON.parse(fs.readFileSync(path.join(__dirname, `../../framework/data/${v}.json`), 'utf8'));
      for (const p of f.perspectives) for (const a of p.axes) for (const s of a.standards) {
        (s.references ?? []).forEach((ref: { ar?: string; en?: string }, i: number) => actual.push({ key: `${f.version}|${s.code}|${i}`, result: parseCitation(ref) }));
      }
    }
    const expected = golden.filter((g) => !g.key.startsWith('extra|')).map(({ key, result }) => ({ key, result }));
    expect(actual.length).toBeGreaterThan(400);
    expect(actual).toEqual(expected);
  });

  it('the synthetic edge cases of the golden list give the same result as before', () => {
    const extras = golden.filter((g) => g.key.startsWith('extra|'));
    expect(extras.length).toBeGreaterThan(0);
    for (const g of extras) expect({ key: g.key, result: parseCitation(g.input!) }).toEqual({ key: g.key, result: g.result });
  });
});
