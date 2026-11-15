// The shipped DGA v5.0 framework (extracted from the official PDF, DGA-1-2-1-111) must stay valid
// and keep the counts confirmed against the PDF, so an accidental edit cannot silently drop a standard.
import official from '../data/dga-v5.0.json';
import { crosswalkFileSchema } from '../crosswalk';
import { validateFrameworkFile } from '../frameworkFile';

describe('official DGA v5.0 framework', () => {
  const report = validateFrameworkFile(official);

  it('validates with no errors or warnings', () => {
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('keeps the counts confirmed against the PDF', () => {
    // 385 top-level requirements + 255 sub-conditions = 640.
    expect(report.stats).toEqual({ perspectives: 10, axes: 24, standards: 89, requirements: 640, proofItems: 386, links: 421 });
    expect(report.framework!.meta).toMatchObject({ issuer: 'DGA', documentCode: 'DGA-1-2-1-111', version: '5.0' });
  });

  it('numbers standards 5.1.1 … 5.24.x without gaps inside each axis', () => {
    const byAxis = new Map<string, number[]>();
    for (const p of (official as any).perspectives) for (const a of p.axes) {
      byAxis.set(a.code, a.standards.map((s: any) => Number(s.code.split('.')[2])));
    }
    expect(byAxis.size).toBe(24);
    for (const [, nums] of byAxis) expect(nums).toEqual(nums.map((_, i) => i + 1));
  });
});

describe('official DGA v4.0 framework and the v4.0 → v5.0 crosswalk', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const v4 = require('../data/dga-v4.0.json');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crosswalk = require('../data/crosswalk-v4.0-v5.0.json');
  const report = validateFrameworkFile(v4);

  it('validates with the counts of the PDF (95 standards in 23 axes)', () => {
    expect(report.issues).toEqual([]);
    expect(report.stats).toMatchObject({ perspectives: 10, axes: 23, standards: 95, proofItems: 389 });
    expect(report.framework!.meta.version).toBe('4.0');
  });

  it('maps every top-level v4.0 requirement to existing v5.0 requirements or marks it removed', () => {
    const parsed = crosswalkFileSchema.parse(crosswalk);
    const v4Top = report.framework!.requirements.filter((r) => !r.parentCode).map((r) => r.code);
    const v5 = validateFrameworkFile(official).framework!.requirements.filter((r) => !r.parentCode).map((r) => r.code);
    expect(parsed.requirements.map((r) => r.from).sort()).toEqual([...v4Top].sort());
    for (const r of parsed.requirements) for (const t of r.to) expect(v5).toContain(t);
  });
});
