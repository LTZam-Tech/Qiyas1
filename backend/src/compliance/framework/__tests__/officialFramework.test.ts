// The shipped DGA v5.0 framework (extracted from the official PDF, DGA-1-2-1-111) must stay valid
// and keep the counts confirmed against the PDF, so an accidental edit cannot silently drop a standard.
import official from '../data/dga-v5.0.json';
import fs from 'fs';
import path from 'path';
import { CROSSWALK_LIMITS, CROSSWALK_RELATIONS, crosswalkFileSchema } from '../crosswalk';
import { FRAMEWORK_LIMITS, validateFrameworkFile } from '../frameworkFile';

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

describe('official files and the size limits (C13, C14)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const files = [require('../data/dga-v4.0.json'), official as any];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crosswalk = require('../data/crosswalk-v4.0-v5.0.json');

  /** The largest value of every limited quantity in one framework file. */
  function maxima(f: any) {
    const m = { text: 0, reference: 0, referencesPerStandard: 0, perspectives: f.perspectives.length, axesPerPerspective: 0, standardsPerFile: 0,
      requirementsPerStandard: 0, childrenPerNode: 0, requirementsPerFile: 0, proofItemsPerStandard: 0, codesPerProofItem: 0, linksPerFile: 0, header: 0 };
    const texts = (t: any) => { for (const v of Object.values(t ?? {})) m.text = Math.max(m.text, String(v).length); };
    m.header = Math.max(f.issuer.length, f.documentCode.length, f.version.length);
    texts(f.title);
    for (const p of f.perspectives) {
      texts(p.name);
      m.axesPerPerspective = Math.max(m.axesPerPerspective, p.axes.length);
      for (const a of p.axes) {
        texts(a.name);
        for (const s of a.standards) {
          m.standardsPerFile += 1;
          texts(s.title); texts(s.goal); texts(s.scope);
          m.referencesPerStandard = Math.max(m.referencesPerStandard, (s.references ?? []).length);
          for (const r of s.references ?? []) for (const v of Object.values(r)) m.reference = Math.max(m.reference, String(v).length);
          let inStandard = 0;
          const walk = (nodes: any[]) => {
            m.childrenPerNode = Math.max(m.childrenPerNode, nodes.length);
            for (const n of nodes) { inStandard += 1; texts(n.text); if (n.children) walk(n.children); }
          };
          walk(s.requirements);
          m.requirementsPerStandard = Math.max(m.requirementsPerStandard, inStandard);
          m.requirementsPerFile += inStandard;
          m.proofItemsPerStandard = Math.max(m.proofItemsPerStandard, (s.proofItems ?? []).length);
          for (const e of s.proofItems ?? []) {
            texts(e.description);
            m.codesPerProofItem = Math.max(m.codesPerProofItem, (e.requirementCodes ?? []).length);
            m.linksPerFile += (e.requirementCodes ?? s.requirements).length;
          }
        }
      }
    }
    return m;
  }

  it('the official v4.0 and v5.0 files and the crosswalk are within every FRAMEWORK_LIMITS value', () => {
    for (const f of files) {
      const m = maxima(f);
      for (const [key, limit] of Object.entries(FRAMEWORK_LIMITS)) {
        // with room to spare: at most half of every limit
        expect({ version: f.version, key, within: m[key as keyof typeof m] * 2 <= limit }).toEqual({ version: f.version, key, within: true });
      }
      expect(validateFrameworkFile(f).ok).toBe(true);
    }
    expect(crosswalkFileSchema.safeParse(crosswalk).success).toBe(true);
    expect(Math.max(...crosswalk.requirements.map((r: any) => r.to.length)) * 2).toBeLessThanOrEqual(CROSSWALK_LIMITS.targetsPerEntry);
    expect(crosswalk.requirements.length).toBeLessThanOrEqual(CROSSWALK_LIMITS.entries);
    expect(crosswalk.standards.length).toBeLessThanOrEqual(CROSSWALK_LIMITS.standards);
  });

  it('crosswalk relations are a subset of the DB CHECK values', () => {
    // the latest crosswalk_relation_check in the v2 migrations is the one in force
    const dir = path.join(__dirname, '../../db/migrations');
    const sql = fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort().map((n) => fs.readFileSync(path.join(dir, n), 'utf8')).join('\n');
    const checks = [...sql.matchAll(/crosswalk_relation_check CHECK \(relation IN \(([^)]*)\)\)/g)];
    expect(checks.length).toBeGreaterThan(0);
    const allowed = checks[checks.length - 1][1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
    // 'removed' entries are never stored
    const stored = CROSSWALK_RELATIONS.filter((r) => r !== 'removed');
    for (const r of stored) expect(allowed).toContain(r);
    for (const r of crosswalk.requirements) if (r.relation !== 'removed') expect(allowed).toContain(r.relation);
  });
});
