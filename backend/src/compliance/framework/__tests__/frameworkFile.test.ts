import sample from '../samples/dga-v5.0-sample.json';
import { validateFrameworkFile } from '../frameworkFile';

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
