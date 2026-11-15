// The shipped DGA v5.0 framework (extracted from the official PDF, DGA-1-2-1-111) must stay valid
// and keep the counts confirmed against the PDF, so an accidental edit cannot silently drop a standard.
import official from '../data/dga-v5.0.json';
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
