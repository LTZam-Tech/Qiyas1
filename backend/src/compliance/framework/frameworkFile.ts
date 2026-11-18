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

/**
 * Size limits of a framework file, set at 10-100x the official DGA files (v4.0, v5.0)
 * so a legitimate file never comes close. They keep a single upload from holding the
 * request transaction, the event loop or the database for minutes (C13, C14).
 */
export const FRAMEWORK_LIMITS = {
  /** Characters of one text field (title, requirement text, description...). */
  text: 10_000,
  /** Characters of one reference (also MAX_CITATION_CHARS in the library). */
  reference: 2_000,
  referencesPerStandard: 50,
  perspectives: 50,
  axesPerPerspective: 100,
  standardsPerFile: 2_000,
  /** All levels of one standard together. */
  requirementsPerStandard: 500,
  childrenPerNode: 100,
  requirementsPerFile: 20_000,
  proofItemsPerStandard: 200,
  codesPerProofItem: 200,
  linksPerFile: 50_000,
  /** Characters of the file header fields (issuer, document code, version). */
  header: 200,
} as const;

const L = FRAMEWORK_LIMITS;
const str = (max: number) => z.string().trim().max(max, `At most ${max} characters`);

const text = z.object({
  ar: str(L.text).min(1, 'Arabic text is required'),
  en: str(L.text).min(1, 'English text is required'),
  ur: str(L.text).min(1).optional(),
});
const optionalText = z.object({ ar: str(L.text), en: str(L.text), ur: str(L.text).optional() }).partial();
const reference = z.object({ ar: str(L.reference), en: str(L.reference), ur: str(L.reference).optional() }).partial();

const code = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/, 'Codes may use letters, digits, dot, dash and underscore');

export const REQUIREMENT_KINDS = ['sequential', 'alternative', 'step', 'single'] as const;
export const PROOF_KINDS = ['document', 'report', 'plan', 'template', 'certificate', 'screenshot', 'link', 'data', 'other'] as const;

type RequirementNode = { code: string; text: z.infer<typeof text>; kind: (typeof REQUIREMENT_KINDS)[number]; children?: unknown[] };

/*
 * Requirements nest at most 3 levels. The three levels are spelled out (no recursive
 * z.lazy), so a deeply nested file is rejected at level 4 without zod ever walking it.
 */
const NESTING_MESSAGE = 'Requirements may be nested at most 3 levels';
const requirementFields = { code, text, kind: z.enum(REQUIREMENT_KINDS).default('single') };
const children = <T extends z.ZodTypeAny>(item: T) => z.array(item).max(L.childrenPerNode, `At most ${L.childrenPerNode} sub-requirements`).optional();
const requirementLevel3 = z.object({ ...requirementFields, children: z.array(z.unknown()).max(0, NESTING_MESSAGE).optional() });
const requirementLevel2 = z.object({ ...requirementFields, children: children(requirementLevel3) });
const requirement = z.object({ ...requirementFields, children: children(requirementLevel2) });

const proofItem = z.object({
  code,
  description: text,
  expectedKind: z.enum(PROOF_KINDS).default('document'),
  /** Omitted = applies to every top-level requirement of the standard. */
  requirementCodes: z.array(code).max(L.codesPerProofItem, `At most ${L.codesPerProofItem} requirement codes`).optional(),
});

const standard = z.object({
  code,
  title: text,
  goal: optionalText.optional(),
  scope: optionalText.optional(),
  references: z.array(reference).max(L.referencesPerStandard, `At most ${L.referencesPerStandard} references`).optional(),
  requirements: z.array(requirement).min(1, 'A standard needs at least one requirement')
    .max(L.requirementsPerStandard, `At most ${L.requirementsPerStandard} requirements per standard`),
  proofItems: z.array(proofItem).max(L.proofItemsPerStandard, `At most ${L.proofItemsPerStandard} proof items per standard`).default([]),
});

const axis = z.object({ code, name: text, standards: z.array(standard).min(1).max(L.standardsPerFile, `At most ${L.standardsPerFile} standards`) });
const perspective = z.object({ code, name: text, axes: z.array(axis).min(1).max(L.axesPerPerspective, `At most ${L.axesPerPerspective} axes`) });

export const frameworkFileSchema = z.object({
  format: z.literal(FRAMEWORK_FORMAT),
  issuer: str(L.header).min(1),
  documentCode: str(L.header).min(1),
  version: str(L.header).min(1),
  publishedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: text,
  perspectives: z.array(perspective).min(1).max(L.perspectives, `At most ${L.perspectives} perspectives`),
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

  let links = 0;
  let tooManyLinks = false;

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
        // this standard's requirements, collected while walking (no per-standard filter over the whole file)
        const standardReqs = new Set<string>();
        const walk = (nodes: RequirementNode[], parent: string | null, path: string, depth: number) => {
          if (depth > 3) issues.push({ level: 'error', path, message: 'Requirements may be nested at most 3 levels' });
          nodes.forEach((r, ri) => {
            unique('requirement', r.code, `${path}.${ri}.code`);
            if (parent === null) topLevel.push(r.code);
            standardReqs.add(r.code);
            flat.requirements.push({ code: r.code, standardCode: sCode, parentCode: parent, kind: r.kind, sortOrder: ri + 1, text: r.text });
            if (r.children?.length) walk(r.children as RequirementNode[], r.code, `${path}.${ri}.children`, depth + 1);
          });
        };
        const before = flat.requirements.length;
        walk(requirements, null, `${sPath}.requirements`, 1);
        if (flat.requirements.length - before > FRAMEWORK_LIMITS.requirementsPerStandard) {
          issues.push({ level: 'error', path: `${sPath}.requirements`, message: `Standard ${sCode} has more than ${FRAMEWORK_LIMITS.requirementsPerStandard} requirements` });
        }

        proofItems.forEach((e, ei) => {
          const ePath = `${sPath}.proofItems.${ei}`;
          unique('proof', e.code, `${ePath}.code`);
          flat.proofItems.push({ code: e.code, standardCode: sCode, sortOrder: ei + 1, description: e.description, expectedKind: e.expectedKind });
          // a code listed twice would insert the same link twice (primary-key violation)
          const targets = [...new Set(e.requirementCodes ?? topLevel)];
          if (!e.requirementCodes) {
            issues.push({ level: 'warning', path: ePath, message: `Proof item "${e.code}" has no requirementCodes; linked to all ${topLevel.length} requirement(s) of ${sCode}` });
          } else if (targets.length < e.requirementCodes.length) {
            issues.push({ level: 'warning', path: `${ePath}.requirementCodes`, message: `Proof item "${e.code}" lists a requirement code more than once; duplicates are ignored` });
          }
          // count the links before creating them: a file over the limit never materialises them
          links += targets.length;
          if (links > FRAMEWORK_LIMITS.linksPerFile) {
            if (!tooManyLinks) issues.push({ level: 'error', path: ePath, message: `The file links proof items to requirements more than ${FRAMEWORK_LIMITS.linksPerFile} times; list requirementCodes on each proof item` });
            tooManyLinks = true;
            return;
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

  if (flat.standards.length > FRAMEWORK_LIMITS.standardsPerFile) {
    issues.push({ level: 'error', path: 'perspectives', message: `The file has more than ${FRAMEWORK_LIMITS.standardsPerFile} standards` });
  }
  if (flat.requirements.length > FRAMEWORK_LIMITS.requirementsPerFile) {
    issues.push({ level: 'error', path: 'perspectives', message: `The file has more than ${FRAMEWORK_LIMITS.requirementsPerFile} requirements` });
  }

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
      links: tooManyLinks ? links : flat.requirementProofItems.length,
    },
    framework: ok ? flat : null,
  };
}
