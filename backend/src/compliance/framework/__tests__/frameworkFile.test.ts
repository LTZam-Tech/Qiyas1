import sample from '../samples/dga-v5.0-sample.json';
import { FRAMEWORK_LIMITS, validateFrameworkFile } from '../frameworkFile';

const clone = () => JSON.parse(JSON.stringify(sample));
const firstStandard = (f: any) => f.perspectives[0].axes[0].standards[0];

describe('DGA framework file', () => {
  it('accepts the v5.0 sample (standard 5.1.1) and flattens it', () => {
    const report = validateFrameworkFile(sample);
    expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats).toEqual({ perspectives: 1, axes: 1, standards: 1, requirements: 5, proofItems: 1, links: 1 });
    const children = report.framework!.requirements.filter((r) => r.parentCode === '5.1.1-R1').map((r) => r.code);
    expect(children).toEqual(['5.1.1-R1a', '5.1.1-R1b', '5.1.1-R1c', '5.1.1-R1d']);
    expect(report.framework!.meta.documentCode).toBe('DGA-1-2-1-111');
  });

  it('BR-LANG-01: Arabic and English are mandatory', () => {
    const f = clone();
    firstStandard(f).title.en = '  ';
    const report = validateFrameworkFile(f);
    expect(report.ok).toBe(false);
    expect(report.issues[0].path).toContain('title.en');
  });

  it('rejects duplicate codes', () => {
    const f = clone();
    firstStandard(f).requirements[0].children[1].code = '5.1.1-R1a';
    const report = validateFrameworkFile(f);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.message.includes('Duplicate requirement code'))).toBe(true);
  });

  it('rejects a proof item pointing at another standard\'s requirement', () => {
    const f = clone();
    firstStandard(f).proofItems[0].requirementCodes = ['9.9.9-R1'];
    const report = validateFrameworkFile(f);
    expect(report.ok).toBe(false);
    expect(report.framework).toBeNull();
  });

  it('a proof item without requirementCodes is linked to all top-level requirements, with a warning', () => {
    const f = clone();
    delete firstStandard(f).proofItems[0].requirementCodes;
    const report = validateFrameworkFile(f);
    expect(report.ok).toBe(true);
    expect(report.issues.some((i) => i.level === 'warning')).toBe(true);
    expect(report.framework!.requirementProofItems).toEqual([{ requirementCode: '5.1.1-R1', proofItemCode: '5.1.1-E1' }]);
  });

  it('a standard needs at least one requirement', () => {
    const f = clone();
    firstStandard(f).requirements = [];
    expect(validateFrameworkFile(f).ok).toBe(false);
  });

  it('refuses unknown file formats and garbage without throwing', () => {
    expect(validateFrameworkFile({ ...clone(), format: 'other/2' }).ok).toBe(false);
    expect(validateFrameworkFile(null).ok).toBe(false);
    expect(validateFrameworkFile('not json').ok).toBe(false);
  });

  it('nothing is tied to a specific version or count (BR-FW-07)', () => {
    const f = clone();
    f.version = '6.0';
    f.perspectives.push({ ...JSON.parse(JSON.stringify(f.perspectives[0])), code: 'P2' });
    // codes must stay unique across the file
    const p2 = f.perspectives[1];
    p2.axes[0].code = '6.1';
    const s = p2.axes[0].standards[0];
    s.code = '6.1.1';
    s.requirements[0].code = '6.1.1-R1';
    s.requirements[0].children.forEach((c: any, i: number) => { c.code = `6.1.1-R1${'abcd'[i]}`; });
    s.proofItems[0].code = '6.1.1-E1';
    s.proofItems[0].requirementCodes = ['6.1.1-R1'];
    const report = validateFrameworkFile(f);
    expect(report.ok).toBe(true);
    expect(report.stats?.perspectives).toBe(2);
  });
});

// ------------------------------------------------------------------ size limits (C13, C14)

const T = { ar: 'نص', en: 'text' };
const makeStandard = (code: string, requirements: number, proofItems: number, requirementCodes?: (i: number) => string[]) => ({
  code,
  title: T,
  requirements: Array.from({ length: requirements }, (_, i) => ({ code: `${code}-R${i + 1}`, text: T })),
  proofItems: Array.from({ length: proofItems }, (_, i) => ({ code: `${code}-E${i + 1}`, description: T, ...(requirementCodes ? { requirementCodes: requirementCodes(i) } : {}) })),
});
const makeFile = (axes: any[][]) => ({
  format: 'qiyas-framework/1', issuer: 'TEST', documentCode: 'TEST-1', version: '1.0', publishedOn: '2026-01-01', title: T,
  perspectives: [{ code: 'P1', name: T, axes: axes.map((standards, i) => ({ code: `A${i + 1}`, name: T, standards })) }],
});
const timed = <R>(fn: () => R): [R, number] => { const t = Date.now(); const r = fn(); return [r, Date.now() - t]; };
const hasError = (report: ReturnType<typeof validateFrameworkFile>, text: string) =>
  report.issues.some((i) => i.level === 'error' && i.message.includes(text));

describe('DGA framework file: size limits (C13, C14)', () => {
  it('rejects a file whose links exceed linksPerFile before materialising them', () => {
    // 400 requirements x 200 proof items without requirementCodes = 80,000 links (> 50,000)
    const [report, ms] = timed(() => validateFrameworkFile(makeFile([[makeStandard('S1', 400, 200)]])));
    expect(report.ok).toBe(false);
    expect(report.framework).toBeNull();
    expect(hasError(report, `more than ${FRAMEWORK_LIMITS.linksPerFile} times`)).toBe(true);
    expect(ms).toBeLessThan(500);
    // positive control: 400 x 100 = 40,000 links is within the limit
    const ok = validateFrameworkFile(makeFile([[makeStandard('S1', 400, 100)]]));
    expect(ok.ok).toBe(true);
    expect(ok.stats!.links).toBe(40_000);
  });

  it('rejects too many requirements per standard', () => {
    expect(validateFrameworkFile(makeFile([[makeStandard('S1', 501, 0)]])).ok).toBe(false);
    // the limit counts every level: 100 top-level requirements with 5 children each = 600
    const nested = makeStandard('S1', 100, 0);
    nested.requirements.forEach((r: any) => { r.children = Array.from({ length: 5 }, (_, i) => ({ code: `${r.code}.${i + 1}`, text: T })); });
    const report = validateFrameworkFile(makeFile([[nested]]));
    expect(report.ok).toBe(false);
    expect(hasError(report, `more than ${FRAMEWORK_LIMITS.requirementsPerStandard} requirements`)).toBe(true);
    // positive control
    expect(validateFrameworkFile(makeFile([[makeStandard('S1', 500, 0)]])).ok).toBe(true);
  });

  it('rejects too many proof items per standard', () => {
    const one = (i: number) => [`S1-R${(i % 10) + 1}`];
    expect(validateFrameworkFile(makeFile([[makeStandard('S1', 10, 201, one)]])).ok).toBe(false);
    expect(validateFrameworkFile(makeFile([[makeStandard('S1', 10, 200, one)]])).ok).toBe(true);
  });

  it('deduplicates repeated requirementCodes', () => {
    const f = clone();
    firstStandard(f).proofItems[0].requirementCodes = ['5.1.1-R1', '5.1.1-R1', '5.1.1-R1'];
    const report = validateFrameworkFile(f);
    expect(report.ok).toBe(true);
    // one link, not three (three would be a primary-key violation on import)
    expect(report.framework!.requirementProofItems).toEqual([{ requirementCode: '5.1.1-R1', proofItemCode: '5.1.1-E1' }]);
    expect(report.stats!.links).toBe(1);
    expect(report.issues.some((i) => i.level === 'warning' && i.message.includes('more than once'))).toBe(true);
  });

  it('rejects nesting deeper than 3 and a 10,000-deep chain without throwing', () => {
    const chain = (depth: number) => {
      const root: any = { code: 'S1-R1', text: T };
      let node = root;
      for (let i = 2; i <= depth; i += 1) { node.children = [{ code: `S1-R${i}`, text: T }]; node = node.children[0]; }
      return root;
    };
    const withChain = (depth: number) => makeFile([[{ code: 'S1', title: T, requirements: [chain(depth)], proofItems: [] }]]);
    // positive control: 3 levels are allowed
    expect(validateFrameworkFile(withChain(3)).ok).toBe(true);
    const four = validateFrameworkFile(withChain(4));
    expect(four.ok).toBe(false);
    expect(hasError(four, 'nested at most 3 levels')).toBe(true);
    let deep!: ReturnType<typeof validateFrameworkFile>;
    expect(() => { deep = validateFrameworkFile(withChain(10_000)); }).not.toThrow();
    expect(deep.ok).toBe(false);
    expect(hasError(deep, 'nested at most 3 levels')).toBe(true);
  });

  it('rejects over-long text and references', () => {
    const longText = clone();
    firstStandard(longText).title.en = 'a'.repeat(FRAMEWORK_LIMITS.text + 1);
    expect(validateFrameworkFile(longText).ok).toBe(false);
    const maxText = clone();
    firstStandard(maxText).title.en = 'a'.repeat(FRAMEWORK_LIMITS.text);
    expect(validateFrameworkFile(maxText).ok).toBe(true);
  });

  it('rejects a reference longer than 2000 characters', () => {
    const f = clone();
    firstStandard(f).references = [{ ar: 'م'.repeat(2001), en: 'x' }];
    const report = validateFrameworkFile(f);
    expect(report.ok).toBe(false);
    expect(report.issues[0].path).toContain('references');
    firstStandard(f).references = [{ ar: 'م'.repeat(2000), en: 'x' }];
    expect(validateFrameworkFile(f).ok).toBe(true);
  });

  it('rejects more than 50 references per standard', () => {
    const f = clone();
    firstStandard(f).references = Array.from({ length: 51 }, () => ({ ar: 'مرجع', en: 'Reference' }));
    expect(validateFrameworkFile(f).ok).toBe(false);
    firstStandard(f).references = Array.from({ length: 50 }, () => ({ ar: 'مرجع', en: 'Reference' }));
    expect(validateFrameworkFile(f).ok).toBe(true);
  });

  it('a file with 5,000 single-requirement standards validates in linear time', () => {
    // 50 axes x 100 standards: within every per-array cap, over standardsPerFile; rejected quickly
    const axes = Array.from({ length: 50 }, (_, a) => Array.from({ length: 100 }, (_, s) => makeStandard(`S${a}-${s}`, 1, 1)));
    const [report, ms] = timed(() => validateFrameworkFile(makeFile(axes)));
    expect(report.ok).toBe(false);
    expect(hasError(report, `more than ${FRAMEWORK_LIMITS.standardsPerFile} standards`)).toBe(true);
    expect(ms).toBeLessThan(1000);
    // positive control: the cap itself (2,000 standards, 2,000 requirements) validates, also quickly
    const [ok, okMs] = timed(() => validateFrameworkFile(makeFile(axes.slice(0, 20))));
    expect(ok.ok).toBe(true);
    expect(ok.stats).toMatchObject({ standards: 2000, requirements: 2000, links: 2000 });
    expect(okMs).toBeLessThan(1000);
  });
});
