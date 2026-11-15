/**
 * DGA framework import file (BR-FW-01..03, BR-FW-07, BR-LANG-01).
 *
 * A framework version (e.g. DGA Basic Digital Transformation Standards v5.0)
 * is delivered as one JSON file in the format below, validated, and only then
 * written to the database. Nothing in the application depends on a specific
 * version, year or number of perspectives.
 *
 * {
 *   "format": "qiyas-framework/1",
 *   "issuer": "DGA", "documentCode": "DGA-1-2-1-111", "version": "5.0", "publishedOn": "2026-04-01",
 *   "title": { "ar": "...", "en": "..." },
 *   "perspectives": [{ "code": "1", "name": {...}, "axes": [{ "code": "5.1", "name": {...},
 *     "standards": [{ "code": "5.1.1", "title": {...}, "goal": {...}, "scope": {...}, "references": [{...}],
 *       "requirements": [{ "code": "5.1.1-R1", "text": {...}, "kind": "sequential", "children": [...] }],
 *       "proofItems": [{ "code": "5.1.1-E1", "description": {...}, "expectedKind": "document", "requirementCodes": ["5.1.1-R1"] }]
 *     }] }] }]
 * }
 */
import { z } from 'zod';

export const FRAMEWORK_FORMAT = 'qiyas-framework/1';

const text = z.object({
  ar: z.string().trim().min(1, 'Arabic text is required'),
  en: z.string().trim().min(1, 'English text is required'),
  ur: z.string().trim().min(1).optional(),
});
const optionalText = z.object({ ar: z.string().trim(), en: z.string().trim(), ur: z.string().trim().optional() }).partial();

const code = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/, 'Codes may use letters, digits, dot, dash and underscore');

export const REQUIREMENT_KINDS = ['sequential', 'alternative', 'step', 'single'] as const;
export const PROOF_KINDS = ['document', 'report', 'plan', 'template', 'certificate', 'screenshot', 'link', 'data', 'other'] as const;

type RequirementNode = { code: string; text: z.infer<typeof text>; kind: (typeof REQUIREMENT_KINDS)[number]; children?: RequirementNode[] };
const requirement: z.ZodType<RequirementNode> = z.lazy(() =>
  z.object({
    code,
    text,
    kind: z.enum(REQUIREMENT_KINDS).default('single'),
    children: z.array(requirement).optional(),
  }),
) as z.ZodType<RequirementNode>;

const proofItem = z.object({
  code,
  description: text,
  expectedKind: z.enum(PROOF_KINDS).default('document'),
  /** Omitted = applies to every top-level requirement of the standard. */
  requirementCodes: z.array(code).optional(),
});

const standard = z.object({
  code,
  title: text,
  goal: optionalText.optional(),
  scope: optionalText.optional(),
  references: z.array(optionalText).optional(),
  requirements: z.array(requirement).min(1, 'A standard needs at least one requirement'),
  proofItems: z.array(proofItem).default([]),
});

const axis = z.object({ code, name: text, standards: z.array(standard).min(1) });
const perspective = z.object({ code, name: text, axes: z.array(axis).min(1) });

export const frameworkFileSchema = z.object({
  format: z.literal(FRAMEWORK_FORMAT),
  issuer: z.string().trim().min(1),
  documentCode: z.string().trim().min(1),
  version: z.string().trim().min(1),
  publishedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: text,
  perspectives: z.array(perspective).min(1),
});

export type FrameworkFile = z.infer<typeof frameworkFileSchema>;

export interface FlatRequirement {
  code: string;
  standardCode: string;
  parentCode: string | null;
  kind: string;
  sortOrder: number;
  text: { ar: string; en: string; ur?: string };
}

export interface FlatFramework {
  meta: Pick<FrameworkFile, 'issuer' | 'documentCode' | 'version' | 'publishedOn' | 'title'>;
  perspectives: Array<{ code: string; sortOrder: number; name: FrameworkFile['title'] }>;
  axes: Array<{ code: string; perspectiveCode: string; sortOrder: number; name: FrameworkFile['title'] }>;
  standards: Array<{ code: string; axisCode: string; sortOrder: number } & Omit<FrameworkFile['perspectives'][number]['axes'][number]['standards'][number], 'code' | 'requirements' | 'proofItems'>>;
  requirements: FlatRequirement[];
  proofItems: Array<{ code: string; standardCode: string; sortOrder: number; description: FrameworkFile['title']; expectedKind: string }>;
  requirementProofItems: Array<{ requirementCode: string; proofItemCode: string }>;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  stats: { perspectives: number; axes: number; standards: number; requirements: number; proofItems: number; links: number } | null;
  framework: FlatFramework | null;
}

/** Parses, validates and flattens a framework file. Never throws for bad input. */
export function validateFrameworkFile(input: unknown): ValidationReport {
  const parsed = frameworkFileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ level: 'error', path: i.path.join('.'), message: i.message })),
      stats: null,
      framework: null,
    };
  }
  const file = parsed.data;
  const issues: ValidationIssue[] = [];
  const seen = { perspective: new Set<string>(), axis: new Set<string>(), standard: new Set<string>(), requirement: new Set<string>(), proof: new Set<string>() };
  const unique = (kind: keyof typeof seen, c: string, path: string) => {
    if (seen[kind].has(c)) issues.push({ level: 'error', path, message: `Duplicate ${kind} code "${c}"` });
    seen[kind].add(c);
  };

  const flat: FlatFramework = {
    meta: { issuer: file.issuer, documentCode: file.documentCode, version: file.version, publishedOn: file.publishedOn, title: file.title },
    perspectives: [], axes: [], standards: [], requirements: [], proofItems: [], requirementProofItems: [],
  };

  file.perspectives.forEach((p, pi) => {
    unique('perspective', p.code, `perspectives.${pi}.code`);
    flat.perspectives.push({ code: p.code, sortOrder: pi + 1, name: p.name });
    p.axes.forEach((a, ai) => {
      unique('axis', a.code, `perspectives.${pi}.axes.${ai}.code`);
      flat.axes.push({ code: a.code, perspectiveCode: p.code, sortOrder: ai + 1, name: a.name });
      a.standards.forEach((s, si) => {
        const sPath = `perspectives.${pi}.axes.${ai}.standards.${si}`;
        unique('standard', s.code, `${sPath}.code`);
        const { requirements, proofItems, code: sCode, ...rest } = s;
        flat.standards.push({ code: sCode, axisCode: a.code, sortOrder: si + 1, ...rest });

        const topLevel: string[] = [];
        const walk = (nodes: RequirementNode[], parent: string | null, path: string, depth: number) => {
          if (depth > 3) issues.push({ level: 'error', path, message: 'Requirements may be nested at most 3 levels' });
          nodes.forEach((r, ri) => {
            unique('requirement', r.code, `${path}.${ri}.code`);
            if (parent === null) topLevel.push(r.code);
            flat.requirements.push({ code: r.code, standardCode: sCode, parentCode: parent, kind: r.kind, sortOrder: ri + 1, text: r.text });
            if (r.children?.length) walk(r.children, r.code, `${path}.${ri}.children`, depth + 1);
          });
        };
        walk(requirements, null, `${sPath}.requirements`, 1);

        const standardReqs = new Set(flat.requirements.filter((r) => r.standardCode === sCode).map((r) => r.code));
        proofItems.forEach((e, ei) => {
          const ePath = `${sPath}.proofItems.${ei}`;
          unique('proof', e.code, `${ePath}.code`);
          flat.proofItems.push({ code: e.code, standardCode: sCode, sortOrder: ei + 1, description: e.description, expectedKind: e.expectedKind });
          const targets = e.requirementCodes ?? topLevel;
          if (!e.requirementCodes) {
            issues.push({ level: 'warning', path: ePath, message: `Proof item "${e.code}" has no requirementCodes; linked to all ${topLevel.length} requirement(s) of ${sCode}` });
          }
          for (const rc of targets) {
            if (!standardReqs.has(rc)) issues.push({ level: 'error', path: `${ePath}.requirementCodes`, message: `Requirement "${rc}" is not part of standard ${sCode}` });
            else flat.requirementProofItems.push({ requirementCode: rc, proofItemCode: e.code });
          }
        });
        if (proofItems.length === 0) {
          issues.push({ level: 'warning', path: sPath, message: `Standard ${sCode} lists no proof items; its requirements become ready with any accepted evidence` });
        }
      });
    });
  });

  const ok = !issues.some((i) => i.level === 'error');
  return {
    ok,
    issues,
    stats: {
      perspectives: flat.perspectives.length,
      axes: flat.axes.length,
      standards: flat.standards.length,
      requirements: flat.requirements.length,
      proofItems: flat.proofItems.length,
      links: flat.requirementProofItems.length,
    },
    framework: ok ? flat : null,
  };
}
