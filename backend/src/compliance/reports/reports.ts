/**
 * Phase 1 reports (docs/phase1/08-dashboards-and-reports.md §6, metrics §7).
 *
 * Every report is built from live data for one cycle, in the reader's
 * language, filtered by the reader's permissions, and stamped with the
 * cycle and "data as of" time. The same data feeds the on-screen view,
 * the printable PDF view and the Excel export. Each generation is audited.
 */
import { ComplianceError, ServiceContext, audit, mustOne, one } from '../core/context';
import { businessMsBetween } from '../domain/calendar';
import { RoleCode } from '../domain/permissions';
import { cycleReadiness } from '../api/queries';
import { TaskRow, taskDeadline } from '../work/tasks';

export type Lang = 'ar' | 'en' | 'ur';
type L = { ar: string; en: string; ur: string };
const L = (ar: string, en: string, ur: string): L => ({ ar, en, ur });

export type ColumnType = 'text' | 'code' | 'number' | 'percent' | 'date' | 'datetime';
interface Column { key: string; label: L; type?: ColumnType }
interface Section { key: string; title: L; columns: Column[]; rows: Array<Record<string, unknown>>; note?: L }
interface Built { summary: Array<{ label: L; value: string | number | null; type?: ColumnType }>; sections: Section[]; subtitle?: string }

export interface RenderedReport {
  code: ReportCode;
  title: string;
  subtitle: string | null;
  cycle: { id: string; name: string } | null;
  asOf: string;
  lang: Lang;
  summary: Array<{ label: string; value: string | number | null; type: ColumnType }>;
  sections: Array<{ key: string; title: string; note: string | null; columns: Array<{ key: string; label: string; type: ColumnType }>; rows: Array<Record<string, unknown>> }>;
}

// ------------------------------------------------------------------ value labels

const STATUS: Record<string, Record<string, L>> = {
  readiness: {
    not_applicable: L('لا ينطبق', 'Not applicable', 'لاگو نہیں'), not_started: L('لم يبدأ', 'Not started', 'شروع نہیں ہوا'),
    in_progress: L('قيد العمل', 'In progress', 'جاری'), ready: L('جاهز', 'Ready', 'تیار'),
  },
  review: {
    draft: L('مسودة', 'Draft', 'مسودہ'), submitted: L('بانتظار المراجعة', 'Awaiting review', 'جائزے کا منتظر'),
    under_review: L('قيد المراجعة', 'Under review', 'زیرِ جائزہ'), accepted: L('مقبول', 'Accepted', 'منظور شدہ'),
    rejected: L('مرفوض', 'Rejected', 'مسترد'), withdrawn: L('مسحوب', 'Withdrawn', 'واپس لیا گیا'),
    revoked: L('أُلغي القبول', 'Acceptance revoked', 'منظوری واپس'), superseded: L('استُبدل بنسخة أحدث', 'Replaced by newer version', 'نئے ورژن سے تبدیل'),
  },
  submission: { not_posted: L('لم يُرفع بعد', 'Not posted yet', 'ابھی پوسٹ نہیں ہوا'), posted: L('مرفوع على منصة الهيئة', 'Posted to DGA', 'DGA پر پوسٹ شدہ') },
  decision: { accept: L('قبول', 'Accept', 'منظور'), reject: L('رفض', 'Reject', 'مسترد'), revoke: L('إلغاء القبول', 'Revoke', 'منظوری واپس') },
  extension: {
    asked: L('طلب من الموظف', 'Asked by employee', 'ملازم کی درخواست'), forwarded: L('حُوّل للمستشار', 'Forwarded', 'آگے بھیجا گیا'),
    declined: L('رفضه المدير', 'Declined by manager', 'مینیجر نے رد کیا'), cancelled: L('أُلغي', 'Cancelled', 'منسوخ'),
    pending: L('بانتظار القرار', 'Pending', 'زیرِ غور'), approved: L('موافق عليه', 'Approved', 'منظور'),
    rejected: L('مرفوض', 'Rejected', 'مسترد'), withdrawn: L('مسحوب', 'Withdrawn', 'واپس لیا گیا'),
  },
  escalation: { manual: L('يدوي', 'Manual', 'دستی'), automatic: L('تلقائي', 'Automatic', 'خودکار') },
  yesno: { true: L('نعم', 'Yes', 'ہاں'), false: L('لا', 'No', 'نہیں') },
};
const label = (lang: Lang, kind: keyof typeof STATUS, v: unknown) => (v === null || v === undefined ? null : STATUS[kind][String(v)]?.[lang] ?? String(v));
const pick = (lang: Lang, ar?: string | null, en?: string | null, ur?: string | null) => (lang === 'ar' ? ar : lang === 'ur' ? ur || ar : en) || en || ar || '';
const days = (ms: number) => Math.round((ms / 86_400_000) * 10) / 10;
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : null);
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// ------------------------------------------------------------------ catalogue of reports

export const REPORT_CODES = ['readiness', 'not-posted', 'evidence-register', 'department-performance', 'deadline-log', 'sla', 'requirement-dossier', 'audit-extract'] as const;
export type ReportCode = (typeof REPORT_CODES)[number];

interface ReportDef {
  title: L;
  description: L;
  /** Roles that may run it (docs 08 §6). */
  roles: RoleCode[];
  /** Also open to members of the Compliance Oversight group. */
  oversight?: boolean;
  params?: Array<'cycleRequirementId' | 'from' | 'to' | 'entityType' | 'action' | 'departmentId'>;
}

export const REPORTS: Record<ReportCode, ReportDef> = {
  readiness: {
    title: L('تقرير جاهزية الدورة', 'Cycle readiness report', 'دور کی تیاری کی رپورٹ'),
    description: L('الجاهزية حسب المنظور والمحور والمعيار والمتطلب، مع أسباب عدم الانطباق.', 'Readiness by perspective, axis, standard and requirement, with applicability reasons.', 'منظور، محور، معیار اور شرط کے لحاظ سے تیاری، عدم اطلاق کی وجوہات کے ساتھ۔'),
    roles: ['EXE', 'QC'],
  },
  'not-posted': {
    title: L('سجل الأدلة غير المرفوعة', 'Not-posted register', 'غیر پوسٹ شدہ ثبوت کا رجسٹر'),
    description: L('أدلة مقبولة لم تُرفع بعد على منصة الهيئة، مع عمرها والمسؤول عنها.', 'Accepted evidence not yet posted to DGA, with its age and owner.', 'منظور شدہ ثبوت جو ابھی DGA پر پوسٹ نہیں ہوئے، عمر اور ذمہ دار کے ساتھ۔'),
    roles: ['EXE', 'DSO', 'QC'],
  },
  'evidence-register': {
    title: L('سجل الأدلة', 'Evidence register', 'ثبوت کا رجسٹر'),
    description: L('كل ربط دليل بمتطلب: الملف والنسخة وحالة المراجعة والقرار وحالة الرفع.', 'Every evidence link: file, version, requirement, review status and decision, posting status.', 'ہر ثبوت کا ربط: فائل، ورژن، شرط، جائزے کی حالت اور فیصلہ، پوسٹنگ کی حالت۔'),
    roles: ['QC', 'DSO'],
  },
  'department-performance': {
    title: L('أداء الإدارات', 'Department performance', 'شعبوں کی کارکردگی'),
    description: L('المهام والالتزام بالمواعيد والتمديدات والتصعيدات والرفض ومدة الإنجاز لكل إدارة.', 'Tasks, on-time rate, extensions, escalations, rejections and cycle times per department.', 'ہر شعبے کے کام، بروقت شرح، توسیع، معاملہ بڑھانا، مستردگی اور دورانیہ۔'),
    roles: ['EXE', 'QC', 'DM'],
  },
  'deadline-log': {
    title: L('سجل المواعيد والتصعيد', 'Deadline & escalation log', 'آخری تاریخ اور معاملہ بڑھانے کا ریکارڈ'),
    description: L('كل طلبات التمديد وقراراتها وكل التصعيدات مع أسبابها.', 'All extension requests and decisions, and all escalations with their reasons.', 'توسیع کی تمام درخواستیں اور فیصلے، اور تمام معاملہ بڑھانا وجوہات کے ساتھ۔'),
    roles: ['EXE', 'QC'],
  },
  sla: {
    title: L('تقرير الالتزام بمدد الخدمة', 'Consultant & officer SLA report', 'مشیر اور افسر کی مقررہ مدت رپورٹ'),
    description: L('الالتزام بمواعيد المراجعة والرد على الاستيضاح وقرارات التمديد والرفع.', 'Timeliness of reviews, clarification answers, extension decisions and posting.', 'جائزوں، وضاحتی جوابات، توسیعی فیصلوں اور پوسٹنگ کی بروقت ادائیگی۔'),
    roles: ['EXE', 'QC'], oversight: true,
  },
  'requirement-dossier': {
    title: L('ملف المتطلب', 'Requirement dossier', 'شرط کی فائل'),
    description: L('متطلب واحد: نصه والأدلة المطلوبة وكل الأدلة بنسخها وتاريخ قراراتها.', 'One requirement: its text, expected proof, and all evidence with versions and decision history.', 'ایک شرط: متن، درکار ثبوت، اور تمام ثبوت ورژن اور فیصلوں کی تاریخ کے ساتھ۔'),
    roles: ['QC', 'DSO'], params: ['cycleRequirementId'],
  },
  'audit-extract': {
    title: L('مستخرج سجل التدقيق', 'Audit extract', 'آڈٹ لاگ کا اقتباس'),
    description: L('سجل التدقيق مصفّى حسب الفترة ونوع السجل والإجراء.', 'The audit log filtered by period, record type and action.', 'آڈٹ لاگ، مدت، ریکارڈ کی قسم اور عمل کے لحاظ سے۔'),
    roles: ['ADM', 'QC'], params: ['from', 'to', 'entityType', 'action'],
  },
};

const hasRole = (ctx: ServiceContext, roles: RoleCode[]) => ctx.actor.grants.some((g) => roles.includes(g.role));

async function inOversight(ctx: ServiceContext): Promise<boolean> {
  return Boolean(await one(ctx.db, `SELECT 1 FROM qiyas.group_members m JOIN qiyas.groups g ON g.id = m.group_id
     WHERE g.code = 'compliance_oversight' AND m.user_id = $1`, [ctx.actor.userId]));
}

async function mayRun(ctx: ServiceContext, code: ReportCode): Promise<boolean> {
  const def = REPORTS[code];
  return hasRole(ctx, def.roles) || (Boolean(def.oversight) && (await inOversight(ctx)));
}

/** The reports this person may run. */
export async function availableReports(ctx: ServiceContext, lang: Lang) {
  const out = [];
  for (const code of REPORT_CODES) {
    if (await mayRun(ctx, code)) out.push({ code, title: REPORTS[code].title[lang], description: REPORTS[code].description[lang], params: REPORTS[code].params ?? [] });
  }
  return out;
}

/** Departments a department manager may report on; null = all. */
function managedDepartments(ctx: ServiceContext): string[] | null {
  if (hasRole(ctx, ['EXE', 'QC', 'ADM', 'DSO'])) return null;
  return ctx.actor.grants.filter((g) => g.role === 'DM' && g.departmentId).map((g) => g.departmentId!);
}

/** DSO and executives see accepted evidence only (data minimization). */
const acceptedOnly = (ctx: ServiceContext) => !hasRole(ctx, ['QC']);

// ------------------------------------------------------------------ builders

export interface ReportParams {
  cycleId: string;
  cycleRequirementId?: string;
  from?: string;
  to?: string;
  entityType?: string;
  action?: string;
}

const C = {
  code: (key = 'code') => ({ key, label: L('الرمز', 'Code', 'کوڈ'), type: 'code' as const }),
  standard: { key: 'standard', label: L('المعيار', 'Standard', 'معیار'), type: 'code' as const },
  requirement: { key: 'requirement', label: L('المتطلب', 'Requirement', 'شرط'), type: 'code' as const },
  department: { key: 'department', label: L('الإدارة', 'Department', 'شعبہ') },
  owner: { key: 'owner', label: L('المسؤول', 'Owner', 'ذمہ دار') },
  task: { key: 'task', label: L('المهمة', 'Task', 'کام') },
  title: { key: 'title', label: L('الدليل', 'Evidence', 'ثبوت') },
  pct: (key: string, l: L) => ({ key, label: l, type: 'percent' as const }),
  n: (key: string, l: L) => ({ key, label: l, type: 'number' as const }),
  dt: (key: string, l: L) => ({ key, label: l, type: 'datetime' as const }),
  t: (key: string, l: L) => ({ key, label: l }),
};

async function buildReadiness(ctx: ServiceContext, p: ReportParams, lang: Lang): Promise<Built> {
  const data = await cycleReadiness(ctx, p.cycleId);
  const rollupCols = [
    C.n('applicable', L('تنطبق', 'Applicable', 'لاگو')), C.n('ready', L('جاهزة', 'Ready', 'تیار')),
    C.n('inProgress', L('قيد العمل', 'In progress', 'جاری')), C.n('notStarted', L('لم تبدأ', 'Not started', 'شروع نہیں')),
    C.n('notApplicable', L('لا تنطبق', 'Not applicable', 'لاگو نہیں')), C.pct('readinessPct', L('الجاهزية', 'Readiness', 'تیاری')),
    C.pct('postingPct', L('نسبة الرفع', 'Posted', 'پوسٹ شدہ')),
  ];
  const roll = (r: any) => ({ applicable: r?.applicable, ready: r?.ready, inProgress: r?.inProgress, notStarted: r?.notStarted, notApplicable: r?.notApplicable, readinessPct: r?.readinessPct, postingPct: r?.postingPct });
  const perspectives = data.perspectives.map((x: any) => ({ code: x.code, name: pick(lang, x.name.ar, x.name.en, x.name.ur), ...roll(x.rollup) }));
  const axes = data.perspectives.flatMap((x: any) => x.axes.map((a: any) => ({ code: a.code, name: pick(lang, a.name.ar, a.name.en, a.name.ur), ...roll(a.rollup) })));
  const standards = data.perspectives.flatMap((x: any) => x.axes.flatMap((a: any) => a.standards.map((s: any) => ({ code: s.code, name: pick(lang, s.title.ar, s.title.en, s.title.ur), ...roll(s.rollup) }))));
  const requirements = data.perspectives.flatMap((x: any) => x.axes.flatMap((a: any) => a.standards.flatMap((s: any) => s.requirements.map((r: any) => ({
    code: r.code, text: pick(lang, r.text.ar, r.text.en, r.text.ur), readiness: label(lang, 'readiness', r.readiness),
    proofs: `${r.coveredProofItems}/${r.expectedProofItems}`, accepted: r.acceptedLinks, posted: r.postedLinks, reason: r.applicable ? null : r.notApplicableReason,
  })))));
  const name = C.t('name', L('الاسم', 'Name', 'نام'));
  const c = data.cycle;
  return {
    summary: [
      { label: L('الجاهزية', 'Readiness', 'تیاری'), value: c.readinessPct, type: 'percent' },
      { label: L('متطلبات جاهزة', 'Ready requirements', 'تیار شرائط'), value: `${c.ready} / ${c.applicable}` },
      { label: L('قيد العمل', 'In progress', 'جاری'), value: c.inProgress, type: 'number' },
      { label: L('لم تبدأ', 'Not started', 'شروع نہیں'), value: c.notStarted, type: 'number' },
      { label: L('لا تنطبق', 'Not applicable', 'لاگو نہیں'), value: c.notApplicable, type: 'number' },
      { label: L('نسبة الرفع على منصة الهيئة', 'Posted to DGA', 'DGA پر پوسٹ شدہ'), value: c.postingPct, type: 'percent' },
    ],
    sections: [
      { key: 'perspectives', title: L('حسب المنظور', 'By perspective', 'منظور کے لحاظ سے'), columns: [C.code(), name, ...rollupCols], rows: perspectives },
      { key: 'axes', title: L('حسب المحور', 'By axis', 'محور کے لحاظ سے'), columns: [C.code(), name, ...rollupCols], rows: axes },
      { key: 'standards', title: L('حسب المعيار', 'By standard', 'معیار کے لحاظ سے'), columns: [C.code(), name, ...rollupCols], rows: standards },
      {
        key: 'requirements', title: L('المتطلبات', 'Requirements', 'شرائط'),
        note: L('الجاهزية لا تحتسب إلا الأدلة المقبولة على المتطلبات المنطبقة.', 'Readiness counts only accepted evidence on applicable requirements.', 'تیاری میں صرف لاگو شرائط پر منظور شدہ ثبوت شمار ہوتے ہیں۔'),
        columns: [C.code(), C.t('text', L('النص', 'Text', 'متن')), C.t('readiness', L('الحالة', 'Status', 'حالت')),
          C.t('proofs', L('الأدلة المطلوبة المقبولة', 'Required proofs accepted', 'منظور شدہ درکار ثبوت')),
          C.n('accepted', L('أدلة مقبولة', 'Accepted', 'منظور شدہ')), C.n('posted', L('مرفوعة', 'Posted', 'پوسٹ شدہ')),
          C.t('reason', L('سبب عدم الانطباق', 'Not-applicable reason', 'عدم اطلاق کی وجہ'))],
        rows: requirements,
      },
    ],
  };
}

const LINK_FROM = `FROM qiyas.evidence_links l
  JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id
  JOIN qiyas.artifacts a ON a.id = v.artifact_id
  JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id
  JOIN qiyas.requirements r ON r.id = cr.requirement_id
  JOIN qiyas.standards s ON s.id = r.standard_id
  LEFT JOIN qiyas.proof_items pi ON pi.id = l.proof_item_id
  LEFT JOIN qiyas.tasks t ON t.id = l.task_id
  LEFT JOIN qiyas.departments d ON d.id = COALESCE(t.department_id, a.department_id)
  LEFT JOIN public.users o ON o.id = t.current_owner_id
  LEFT JOIN public.users up ON up.id = v.uploaded_by`;

async function buildNotPosted(ctx: ServiceContext, p: ReportParams, lang: Lang): Promise<Built> {
  const { rows } = await ctx.db.query(
    `SELECT s.code AS standard, r.code AS requirement, pi.code AS proof, a.title, v.version_no, v.original_filename,
            d.name_ar, d.name_en, o.name AS owner, t.title AS task,
            (SELECT max(rd.at) FROM qiyas.review_decisions rd WHERE rd.evidence_link_id = l.id AND rd.decision = 'accept') AS accepted_at
       ${LINK_FROM}
      WHERE cr.cycle_id = $1 AND l.review_status = 'accepted' AND l.submission_status = 'not_posted'
      ORDER BY accepted_at NULLS FIRST, s.code, r.code`, [p.cycleId]);
  const out = rows.map((x) => ({
    standard: x.standard, requirement: x.requirement, proof: x.proof, title: x.title, version: x.version_no, file: x.original_filename,
    department: pick(lang, x.name_ar, x.name_en), owner: x.owner, task: x.task, acceptedAt: x.accepted_at,
    age: x.accepted_at ? days(businessMsBetween(new Date(x.accepted_at), ctx.now, ctx.calendar)) : null,
  }));
  return {
    summary: [
      { label: L('أدلة مقبولة غير مرفوعة', 'Accepted, not posted', 'منظور شدہ، پوسٹ نہیں ہوئے'), value: out.length, type: 'number' },
      { label: L('أقدمها (أيام عمل)', 'Oldest (business days)', 'سب سے پرانا (کاروباری دن)'), value: out.length ? Math.max(...out.map((x) => x.age ?? 0)) : null, type: 'number' },
    ],
    sections: [{
      key: 'not-posted', title: L('غير المرفوعة، الأقدم أولًا', 'Not posted, oldest first', 'غیر پوسٹ شدہ، پرانے پہلے'),
      columns: [C.standard, C.requirement, C.code('proof'), C.title, C.n('version', L('النسخة', 'Version', 'ورژن')), C.t('file', L('الملف', 'File', 'فائل')),
        C.department, C.owner, C.dt('acceptedAt', L('تاريخ القبول', 'Accepted on', 'منظوری کی تاریخ')), C.n('age', L('العمر (أيام عمل)', 'Age (business days)', 'عمر (کاروباری دن)'))],
      rows: out,
    }],
  };
}

async function buildEvidenceRegister(ctx: ServiceContext, p: ReportParams, lang: Lang): Promise<Built> {
  const { rows } = await ctx.db.query(
    `SELECT s.code AS standard, r.code AS requirement, pi.code AS proof, a.title, v.version_no, v.original_filename, v.external_url,
            up.name AS uploaded_by, v.uploaded_at, d.name_ar, d.name_en, l.review_status, l.submission_status, l.posted_at, l.dga_reference,
            last.decision, last.at AS decided_at, last.reviewer, last.comment
       ${LINK_FROM}
       LEFT JOIN LATERAL (SELECT rd.decision, rd.at, rd.comment, ru.name AS reviewer FROM qiyas.review_decisions rd
                            JOIN public.users ru ON ru.id = rd.reviewer_id WHERE rd.evidence_link_id = l.id ORDER BY rd.at DESC LIMIT 1) last ON TRUE
      WHERE cr.cycle_id = $1 AND (NOT $2 OR l.review_status = 'accepted')
      ORDER BY s.code, r.code, a.title, v.version_no`, [p.cycleId, acceptedOnly(ctx)]);
  const out = rows.map((x) => ({
    standard: x.standard, requirement: x.requirement, proof: x.proof, title: x.title, version: x.version_no, file: x.original_filename ?? x.external_url,
    uploadedBy: x.uploaded_by, uploadedAt: x.uploaded_at, department: pick(lang, x.name_ar, x.name_en),
    review: label(lang, 'review', x.review_status), decision: label(lang, 'decision', x.decision), decidedAt: x.decided_at, reviewer: x.reviewer, comment: x.comment,
    submission: label(lang, 'submission', x.submission_status), postedAt: x.posted_at, dgaReference: x.dga_reference,
  }));
  const count = (s: string) => rows.filter((x) => x.review_status === s).length;
  return {
    summary: [
      { label: L('روابط الأدلة', 'Evidence links', 'ثبوت کے روابط'), value: out.length, type: 'number' },
      { label: L('مقبولة', 'Accepted', 'منظور شدہ'), value: count('accepted'), type: 'number' },
      { label: L('بانتظار المراجعة', 'Awaiting review', 'جائزے کا منتظر'), value: count('submitted') + count('under_review'), type: 'number' },
      { label: L('مرفوضة', 'Rejected', 'مسترد'), value: count('rejected'), type: 'number' },
      { label: L('مرفوعة على الهيئة', 'Posted to DGA', 'DGA پر پوسٹ شدہ'), value: rows.filter((x) => x.submission_status === 'posted').length, type: 'number' },
    ],
    sections: [{
      key: 'links', title: L('كل الروابط', 'All links', 'تمام روابط'),
      note: acceptedOnly(ctx) ? L('يعرض الأدلة المقبولة فقط حسب صلاحياتك.', 'Shows accepted evidence only, as your access allows.', 'آپ کی رسائی کے مطابق صرف منظور شدہ ثبوت۔') : undefined,
      columns: [C.standard, C.requirement, C.code('proof'), C.title, C.n('version', L('النسخة', 'Version', 'ورژن')), C.t('file', L('الملف أو الرابط', 'File or link', 'فائل یا لنک')),
        C.t('uploadedBy', L('رفعه', 'Uploaded by', 'اپ لوڈ کنندہ')), C.dt('uploadedAt', L('تاريخ الرفع', 'Uploaded on', 'اپ لوڈ کی تاریخ')), C.department,
        C.t('review', L('حالة المراجعة', 'Review status', 'جائزے کی حالت')), C.t('decision', L('آخر قرار', 'Last decision', 'آخری فیصلہ')),
        C.t('reviewer', L('المراجع', 'Reviewer', 'جائزہ کار')), C.dt('decidedAt', L('تاريخ القرار', 'Decided on', 'فیصلے کی تاریخ')),
        C.t('comment', L('ملاحظة المراجع', 'Reviewer comment', 'جائزہ کار کا تبصرہ')), C.t('submission', L('حالة الرفع', 'Posting status', 'پوسٹنگ کی حالت')),
        C.dt('postedAt', L('تاريخ الرفع على الهيئة', 'Posted on', 'پوسٹ کی تاریخ')), C.t('dgaReference', L('مرجع الهيئة', 'DGA reference', 'DGA حوالہ'))],
      rows: out,
    }],
  };
}

/** Tasks of the cycle with first submission and deadline facts (metrics §7). */
async function taskFacts(ctx: ServiceContext, cycleId: string, departments: string[] | null) {
  const { rows } = await ctx.db.query(
    `SELECT t.*, d.name_ar AS dept_ar, d.name_en AS dept_en, o.name AS owner_name,
            (SELECT min(l.submitted_at) FROM qiyas.evidence_links l WHERE l.task_id = t.id) AS first_submitted_at,
            (SELECT count(*)::int FROM qiyas.extension_requests e WHERE e.task_id = t.id AND e.level = 'formal' AND e.status = 'approved') AS extensions,
            (SELECT count(*)::int FROM qiyas.escalations e WHERE e.task_id = t.id AND e.kind = 'manual') AS escalations_manual,
            (SELECT count(*)::int FROM qiyas.escalations e WHERE e.task_id = t.id AND e.kind = 'automatic') AS escalations_auto,
            (SELECT count(*)::int FROM qiyas.review_decisions rd JOIN qiyas.evidence_links l ON l.id = rd.evidence_link_id
              WHERE l.task_id = t.id AND rd.decision = 'reject') AS rejections
       FROM qiyas.tasks t JOIN qiyas.departments d ON d.id = t.department_id JOIN public.users o ON o.id = t.current_owner_id
      WHERE t.cycle_id = $1 AND t.execution_status NOT IN ('draft', 'cancelled') AND ($2::uuid[] IS NULL OR t.department_id = ANY($2::uuid[]))`,
    [cycleId, departments]);
  const out = [];
  for (const t of rows) {
    const d = await taskDeadline(ctx, t as TaskRow);
    const first = t.first_submitted_at ? new Date(t.first_submitted_at) : null;
    out.push({
      ...t, deadline: d,
      onTime: first ? first <= d.currentDueAt : null,
      onOriginal: first ? first <= new Date(t.original_due_at) : null,
      daysToSubmit: first ? days(businessMsBetween(new Date(t.created_at), first, ctx.calendar)) : null,
    });
  }
  return out;
}

async function buildDepartmentPerformance(ctx: ServiceContext, p: ReportParams, lang: Lang): Promise<Built> {
  const departments = managedDepartments(ctx);
  if (departments && !departments.length) throw new ComplianceError('forbidden', 'You manage no department');
  const tasks = await taskFacts(ctx, p.cycleId, departments);
  const groups = new Map<string, typeof tasks>();
  for (const t of tasks) groups.set(t.department_id, [...(groups.get(t.department_id) ?? []), t]);
  const rowFor = (name: string, ts: typeof tasks) => {
    const submitted = ts.filter((t) => t.onTime !== null);
    return {
      department: name, tasks: ts.length, completed: ts.filter((t) => t.execution_status === 'completed').length,
      overdue: ts.filter((t) => t.deadline.isOverdue).length,
      onTime: pct(submitted.filter((t) => t.onTime).length, submitted.length),
      onOriginal: pct(submitted.filter((t) => t.onOriginal).length, submitted.length),
      extensions: ts.reduce((n, t) => n + t.extensions, 0),
      escalations: ts.reduce((n, t) => n + t.escalations_manual + t.escalations_auto, 0),
      rejections: ts.reduce((n, t) => n + t.rejections, 0),
      daysToSubmit: mean(ts.map((t) => t.daysToSubmit).filter((x): x is number => x !== null)),
    };
  };
  const rows = [...groups.values()].map((ts) => rowFor(pick(lang, ts[0].dept_ar, ts[0].dept_en), ts)).sort((a, b) => String(a.department).localeCompare(String(b.department)));
  const all = rowFor(pick(lang, 'المجموع', 'Total', 'کل'), tasks);
  const taskRows = tasks.map((t) => ({
    department: pick(lang, t.dept_ar, t.dept_en), task: t.title, owner: t.owner_name, originalDue: t.original_due_at, currentDue: t.deadline.currentDueAt,
    firstSubmitted: t.first_submitted_at, onTime: label(lang, 'yesno', t.onTime), extensions: t.extensions, escalations: t.escalations_manual + t.escalations_auto, rejections: t.rejections,
  })).sort((a, b) => String(a.department).localeCompare(String(b.department)) || String(a.task).localeCompare(String(b.task)));
  const cols = [C.department, C.n('tasks', L('المهام', 'Tasks', 'کام')), C.n('completed', L('مكتملة', 'Completed', 'مکمل')), C.n('overdue', L('متأخرة', 'Overdue', 'تاخیر شدہ')),
    C.pct('onTime', L('التقديم في الموعد', 'Submitted on time', 'بروقت جمع')), C.pct('onOriginal', L('الالتزام بالموعد الأصلي', 'Met original deadline', 'اصل تاریخ کی پابندی')),
    C.n('extensions', L('تمديدات معتمدة', 'Extensions approved', 'منظور شدہ توسیع')), C.n('escalations', L('تصعيدات', 'Escalations', 'معاملہ بڑھانا')),
    C.n('rejections', L('حالات رفض', 'Rejections', 'مستردگیاں')), C.n('daysToSubmit', L('متوسط أيام التقديم', 'Avg business days to submit', 'جمع کرانے کے اوسط کاروباری دن'))];
  return {
    summary: [
      { label: L('المهام', 'Tasks', 'کام'), value: all.tasks, type: 'number' },
      { label: L('التقديم في الموعد', 'Submitted on time', 'بروقت جمع'), value: all.onTime, type: 'percent' },
      { label: L('متأخرة الآن', 'Overdue now', 'اس وقت تاخیر شدہ'), value: all.overdue, type: 'number' },
      { label: L('تصعيدات', 'Escalations', 'معاملہ بڑھانا'), value: all.escalations, type: 'number' },
    ],
    sections: [
      { key: 'departments', title: L('حسب الإدارة', 'By department', 'شعبے کے لحاظ سے'), columns: cols, rows: [...rows, all] },
      {
        key: 'tasks', title: L('المهام', 'Tasks', 'کام'),
        columns: [C.department, C.task, C.owner, C.dt('originalDue', L('الموعد الأصلي', 'Original deadline', 'اصل آخری تاریخ')),
          C.dt('currentDue', L('الموعد الحالي', 'Current deadline', 'موجودہ آخری تاریخ')), C.dt('firstSubmitted', L('أول تقديم', 'First submitted', 'پہلی بار جمع')),
          C.t('onTime', L('في الموعد', 'On time', 'بروقت')), C.n('extensions', L('تمديدات', 'Extensions', 'توسیع')),
          C.n('escalations', L('تصعيدات', 'Escalations', 'معاملہ بڑھانا')), C.n('rejections', L('رفض', 'Rejections', 'مستردگی'))],
        rows: taskRows,
      },
    ],
  };
}

async function buildDeadlineLog(ctx: ServiceContext, p: ReportParams, lang: Lang): Promise<Built> {
  const { rows: ext } = await ctx.db.query(
    `SELECT e.*, t.title AS task, d.name_ar, d.name_en, rq.name AS requested_by_name, dc.name AS decided_by_name
       FROM qiyas.extension_requests e JOIN qiyas.tasks t ON t.id = e.task_id JOIN qiyas.departments d ON d.id = t.department_id
       JOIN public.users rq ON rq.id = e.requested_by LEFT JOIN public.users dc ON dc.id = e.decided_by
      WHERE t.cycle_id = $1 ORDER BY e.created_at`, [p.cycleId]);
  const { rows: esc } = await ctx.db.query(
    `SELECT e.*, t.title AS task, d.name_ar, d.name_en, f.name AS from_name, tt.name AS to_name, b.name AS by_name
       FROM qiyas.escalations e JOIN qiyas.tasks t ON t.id = e.task_id JOIN qiyas.departments d ON d.id = t.department_id
       JOIN public.users f ON f.id = e.from_owner_id JOIN public.users tt ON tt.id = e.to_owner_id LEFT JOIN public.users b ON b.id = e.escalated_by
      WHERE t.cycle_id = $1 ORDER BY e.at`, [p.cycleId]);
  const { rows: corrections } = await ctx.db.query(
    `SELECT al.at, al.reason, al.before_value, al.after_value, u.name AS actor, t.title AS task
       FROM qiyas.audit_log al JOIN qiyas.tasks t ON t.id::text = al.entity_id LEFT JOIN public.users u ON u.id = al.actor_id
      WHERE al.action = 'deadline.corrected' AND t.cycle_id = $1 ORDER BY al.at`, [p.cycleId]);
  return {
    summary: [
      { label: L('طلبات تمديد رسمية', 'Formal extension requests', 'باضابطہ توسیعی درخواستیں'), value: ext.filter((e) => e.level === 'formal').length, type: 'number' },
      { label: L('معتمدة', 'Approved', 'منظور'), value: ext.filter((e) => e.status === 'approved').length, type: 'number' },
      { label: L('تصعيدات يدوية', 'Manual escalations', 'دستی معاملہ بڑھانا'), value: esc.filter((e) => e.kind === 'manual').length, type: 'number' },
      { label: L('تصعيدات تلقائية', 'Automatic escalations', 'خودکار معاملہ بڑھانا'), value: esc.filter((e) => e.kind === 'automatic').length, type: 'number' },
    ],
    sections: [
      {
        key: 'extensions', title: L('طلبات التمديد', 'Extension requests', 'توسیع کی درخواستیں'),
        columns: [C.department, C.task, C.t('level', L('المستوى', 'Level', 'سطح')), C.t('requestedBy', L('الطالب', 'Requested by', 'درخواست گزار')),
          C.dt('createdAt', L('تاريخ الطلب', 'Requested on', 'درخواست کی تاریخ')), C.dt('requestedDue', L('الموعد المطلوب', 'Requested deadline', 'مطلوبہ تاریخ')),
          C.t('justification', L('المبرر', 'Justification', 'جواز')), C.t('status', L('الحالة', 'Status', 'حالت')), C.t('decidedBy', L('صاحب القرار', 'Decided by', 'فیصلہ کنندہ')),
          C.dt('decidedAt', L('تاريخ القرار', 'Decided on', 'فیصلے کی تاریخ')), C.dt('approvedDue', L('الموعد المعتمد', 'Approved deadline', 'منظور شدہ تاریخ')),
          C.t('reason', L('سبب القرار', 'Decision reason', 'فیصلے کی وجہ'))],
        rows: ext.map((e) => ({
          department: pick(lang, e.name_ar, e.name_en), task: e.task,
          level: e.level === 'formal' ? pick(lang, 'رسمي', 'Formal', 'باضابطہ') : pick(lang, 'طلب الموظف من مديره', 'Employee ask', 'ملازم کی درخواست'),
          requestedBy: e.requested_by_name, createdAt: e.created_at, requestedDue: e.requested_due_at, justification: e.justification,
          status: label(lang, 'extension', e.status), decidedBy: e.decided_by_name, decidedAt: e.decided_at, approvedDue: e.approved_due_at, reason: e.decision_reason,
        })),
      },
      {
        key: 'escalations', title: L('التصعيدات', 'Escalations', 'معاملہ بڑھانا'),
        columns: [C.department, C.task, C.t('kind', L('النوع', 'Kind', 'قسم')), C.dt('at', L('التاريخ', 'Date', 'تاریخ')),
          C.t('from', L('من', 'From', 'سے')), C.t('to', L('إلى', 'To', 'کو')), C.t('by', L('بواسطة', 'By', 'بذریعہ')), C.t('reason', L('السبب', 'Reason', 'وجہ'))],
        rows: esc.map((e) => ({ department: pick(lang, e.name_ar, e.name_en), task: e.task, kind: label(lang, 'escalation', e.kind), at: e.at, from: e.from_name, to: e.to_name, by: e.by_name, reason: e.reason })),
      },
      {
        key: 'corrections', title: L('تصحيحات المواعيد', 'Deadline corrections', 'آخری تاریخ کی درستگیاں'),
        columns: [C.task, C.dt('at', L('التاريخ', 'Date', 'تاریخ')), C.t('actor', L('بواسطة', 'By', 'بذریعہ')), C.t('reason', L('السبب', 'Reason', 'وجہ'))],
        rows: corrections.map((c) => ({ task: c.task, at: c.at, actor: c.actor, reason: c.reason })),
      },
    ],
  };
}

async function buildSla(ctx: ServiceContext, p: ReportParams, lang: Lang): Promise<Built> {
  const { rows: reviews } = await ctx.db.query(
    `SELECT rd.at, rd.decision, u.name AS reviewer, l.submitted_at, l.review_due_at, r.code AS requirement
       FROM qiyas.review_decisions rd JOIN public.users u ON u.id = rd.reviewer_id
       JOIN qiyas.evidence_links l ON l.id = rd.evidence_link_id JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id
       JOIN qiyas.requirements r ON r.id = cr.requirement_id
      WHERE cr.cycle_id = $1 AND rd.decision IN ('accept', 'reject') ORDER BY rd.at`, [p.cycleId]);
  const { rows: clar } = await ctx.db.query(
    `SELECT c.*, u.name AS answered_by_name FROM qiyas.clarifications c JOIN qiyas.tasks t ON t.id = c.task_id
       LEFT JOIN public.users u ON u.id = c.answered_by WHERE t.cycle_id = $1`, [p.cycleId]);
  const { rows: ext } = await ctx.db.query(
    `SELECT e.*, u.name AS decided_by_name FROM qiyas.extension_requests e JOIN qiyas.tasks t ON t.id = e.task_id
       LEFT JOIN public.users u ON u.id = e.decided_by WHERE t.cycle_id = $1 AND e.level = 'formal'`, [p.cycleId]);
  const { rows: posts } = await ctx.db.query(
    `SELECT l.posted_at, u.name AS poster,
            (SELECT max(rd.at) FROM qiyas.review_decisions rd WHERE rd.evidence_link_id = l.id AND rd.decision = 'accept') AS accepted_at
       FROM qiyas.evidence_links l JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id LEFT JOIN public.users u ON u.id = l.posted_by
      WHERE cr.cycle_id = $1 AND l.submission_status = 'posted'`, [p.cycleId]);

  const bd = (a: Date | string, b: Date | string) => days(businessMsBetween(new Date(a), new Date(b), ctx.calendar));
  type Row = { person: string; activity: string; count: number; onTime: number | null; avgDays: number | null };
  const people = new Map<string, { activity: string; person: string; durations: number[]; onTime: boolean[] }>();
  const add = (activity: string, person: string | null, duration: number | null, onTime: boolean | null) => {
    const key = `${activity}|${person ?? '-'}`;
    const e = people.get(key) ?? { activity, person: person ?? '—', durations: [], onTime: [] };
    if (duration !== null) e.durations.push(duration);
    if (onTime !== null) e.onTime.push(onTime);
    people.set(key, e);
  };
  const A = {
    review: pick(lang, 'مراجعة الأدلة', 'Evidence review', 'ثبوت کا جائزہ'),
    clar: pick(lang, 'الرد على الاستيضاح', 'Clarification answer', 'وضاحت کا جواب'),
    ext: pick(lang, 'قرار التمديد', 'Extension decision', 'توسیع کا فیصلہ'),
    post: pick(lang, 'الرفع على منصة الهيئة', 'Posting to DGA', 'DGA پر پوسٹنگ'),
  };
  for (const r of reviews) add(A.review, r.reviewer, r.submitted_at ? bd(r.submitted_at, r.at) : null, r.review_due_at ? new Date(r.at) <= new Date(r.review_due_at) : null);
  for (const c of clar.filter((x) => x.answered_at)) add(A.clar, c.answered_by_name, bd(c.created_at, c.answered_at), new Date(c.answered_at) <= new Date(c.response_due_at));
  for (const e of ext.filter((x) => x.decided_at)) add(A.ext, e.decided_by_name, bd(e.created_at, e.decided_at), e.decision_due_at ? new Date(e.decided_at) <= new Date(e.decision_due_at) : null);
  for (const x of posts.filter((y) => y.accepted_at)) add(A.post, x.poster, bd(x.accepted_at, x.posted_at), null);
  const rows: Row[] = [...people.values()].map((e) => ({
    activity: e.activity, person: e.person, count: Math.max(e.durations.length, e.onTime.length),
    onTime: pct(e.onTime.filter(Boolean).length, e.onTime.length), avgDays: mean(e.durations),
  })).sort((a, b) => a.activity.localeCompare(b.activity) || a.person.localeCompare(b.person));

  const openLate = (await ctx.db.query(
    `SELECT count(*)::int AS n FROM qiyas.evidence_links l JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id
      WHERE cr.cycle_id = $1 AND l.review_status IN ('submitted', 'under_review') AND l.review_due_at < $2`, [p.cycleId, ctx.now])).rows[0].n;
  const firstPass = (await ctx.db.query(
    `SELECT count(*) FILTER (WHERE first.decision = 'accept')::int AS accepted, count(*)::int AS reviewed FROM (
       SELECT DISTINCT ON (rd.evidence_link_id) rd.decision FROM qiyas.review_decisions rd JOIN qiyas.evidence_links l ON l.id = rd.evidence_link_id
         JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id WHERE cr.cycle_id = $1 AND rd.decision IN ('accept', 'reject')
        ORDER BY rd.evidence_link_id, rd.at) first`, [p.cycleId])).rows[0];
  return {
    summary: [
      { label: L('متوسط زمن المراجعة (أيام عمل)', 'Average review time (business days)', 'جائزے کا اوسط وقت (کاروباری دن)'), value: mean(reviews.filter((r) => r.submitted_at).map((r) => bd(r.submitted_at, r.at))), type: 'number' },
      { label: L('القبول من أول مراجعة', 'First-pass acceptance', 'پہلے جائزے میں منظوری'), value: pct(firstPass.accepted, firstPass.reviewed), type: 'percent' },
      { label: L('متوسط زمن الرفع (أيام عمل)', 'Average posting time (business days)', 'پوسٹنگ کا اوسط وقت (کاروباری دن)'), value: mean(posts.filter((x) => x.accepted_at).map((x) => bd(x.accepted_at, x.posted_at))), type: 'number' },
      { label: L('مراجعات متأخرة الآن', 'Reviews overdue now', 'اس وقت تاخیر شدہ جائزے'), value: openLate, type: 'number' },
    ],
    sections: [{
      key: 'sla', title: L('حسب النشاط والشخص', 'By activity and person', 'سرگرمی اور فرد کے لحاظ سے'),
      columns: [C.t('activity', L('النشاط', 'Activity', 'سرگرمی')), C.t('person', L('الشخص', 'Person', 'فرد')), C.n('count', L('العدد', 'Count', 'تعداد')),
        C.pct('onTime', L('في الموعد', 'On time', 'بروقت')), C.n('avgDays', L('متوسط المدة (أيام عمل)', 'Average (business days)', 'اوسط (کاروباری دن)'))],
      rows,
    }],
  };
}

async function buildDossier(ctx: ServiceContext, p: ReportParams, lang: Lang): Promise<Built> {
  if (!p.cycleRequirementId) throw new ComplianceError('validation', 'Choose a requirement');
  const r = await mustOne(ctx.db, 'requirement', `SELECT cr.*, r.code, r.text_ar, r.text_en, r.text_ur, r.id AS requirement_id, s.code AS standard_code,
       s.title_ar, s.title_en, s.title_ur FROM qiyas.cycle_requirements cr JOIN qiyas.requirements r ON r.id = cr.requirement_id
       JOIN qiyas.standards s ON s.id = r.standard_id WHERE cr.id = $1 AND cr.cycle_id = $2`, [p.cycleRequirementId, p.cycleId]);
  const { rows: subs } = await ctx.db.query('SELECT code, text_ar, text_en, text_ur FROM qiyas.requirements WHERE parent_requirement_id = $1 ORDER BY sort_order', [r.requirement_id]);
  const { rows: proofs } = await ctx.db.query(`SELECT pi.code, pi.description_ar, pi.description_en, pi.description_ur, pi.expected_kind FROM qiyas.requirement_proof_items rp
     JOIN qiyas.proof_items pi ON pi.id = rp.proof_item_id WHERE rp.requirement_id = $1 ORDER BY pi.sort_order`, [r.requirement_id]);
  const { rows: links } = await ctx.db.query(
    `SELECT l.id, pi.code AS proof, a.title, v.version_no, v.original_filename, v.external_url, up.name AS uploaded_by, v.uploaded_at,
            l.review_status, l.submission_status, l.posted_at, l.dga_reference
       ${LINK_FROM} WHERE l.cycle_requirement_id = $1 AND (NOT $2 OR l.review_status = 'accepted') ORDER BY v.uploaded_at`, [p.cycleRequirementId, acceptedOnly(ctx)]);
  const ids = links.map((l) => l.id);
  const { rows: history } = await ctx.db.query(
    `SELECT x.at, x.link_id, x.event, x.detail, x.actor FROM (
       SELECT rd.at, rd.evidence_link_id AS link_id, rd.decision AS event, rd.comment AS detail, u.name AS actor
         FROM qiyas.review_decisions rd JOIN public.users u ON u.id = rd.reviewer_id WHERE rd.evidence_link_id = ANY($1::uuid[])
       UNION ALL
       SELECT se.at, se.evidence_link_id, se.to_status, COALESCE(se.dga_reference, se.reason), u.name
         FROM qiyas.submission_events se JOIN public.users u ON u.id = se.actor_id WHERE se.evidence_link_id = ANY($1::uuid[])) x
     ORDER BY x.at`, [ids]);
  const titleOf = new Map(links.map((l) => [l.id, `${l.title} v${l.version_no}`]));
  return {
    subtitle: `${r.code} — ${pick(lang, r.text_ar, r.text_en, r.text_ur)}`,
    summary: [
      { label: L('المعيار', 'Standard', 'معیار'), value: `${r.standard_code} ${pick(lang, r.title_ar, r.title_en, r.title_ur)}` },
      { label: L('الحالة', 'Status', 'حالت'), value: label(lang, 'readiness', r.readiness) },
      { label: L('ينطبق', 'Applicable', 'لاگو'), value: label(lang, 'yesno', r.is_applicable) + (r.is_applicable ? '' : ` — ${r.not_applicable_reason}`) },
      { label: L('روابط الأدلة', 'Evidence links', 'ثبوت کے روابط'), value: links.length, type: 'number' },
    ],
    sections: [
      ...(subs.length ? [{ key: 'conditions', title: L('الشروط الفرعية', 'Sub-conditions', 'ذیلی شرائط'), columns: [C.code(), C.t('text', L('النص', 'Text', 'متن'))],
        rows: subs.map((x) => ({ code: x.code, text: pick(lang, x.text_ar, x.text_en, x.text_ur) })) }] : []),
      { key: 'proofs', title: L('الأدلة المطلوبة', 'Expected proof', 'درکار ثبوت'), columns: [C.code(), C.t('text', L('الوصف', 'Description', 'تفصیل'))],
        rows: proofs.map((x) => ({ code: x.code, text: pick(lang, x.description_ar, x.description_en, x.description_ur) })) },
      {
        key: 'evidence', title: L('الأدلة ونسخها', 'Evidence and versions', 'ثبوت اور ورژن'),
        columns: [C.code('proof'), C.title, C.n('version', L('النسخة', 'Version', 'ورژن')), C.t('file', L('الملف أو الرابط', 'File or link', 'فائل یا لنک')),
          C.t('uploadedBy', L('رفعه', 'Uploaded by', 'اپ لوڈ کنندہ')), C.dt('uploadedAt', L('تاريخ الرفع', 'Uploaded on', 'اپ لوڈ کی تاریخ')),
          C.t('review', L('حالة المراجعة', 'Review status', 'جائزے کی حالت')), C.t('submission', L('حالة الرفع', 'Posting status', 'پوسٹنگ کی حالت')),
          C.t('dgaReference', L('مرجع الهيئة', 'DGA reference', 'DGA حوالہ'))],
        rows: links.map((l) => ({ proof: l.proof, title: l.title, version: l.version_no, file: l.original_filename ?? l.external_url, uploadedBy: l.uploaded_by, uploadedAt: l.uploaded_at,
          review: label(lang, 'review', l.review_status), submission: label(lang, 'submission', l.submission_status), dgaReference: l.dga_reference })),
      },
      {
        key: 'history', title: L('سجل القرارات', 'Decision history', 'فیصلوں کی تاریخ'),
        columns: [C.dt('at', L('التاريخ', 'Date', 'تاریخ')), C.title, C.t('event', L('الحدث', 'Event', 'واقعہ')), C.t('actor', L('بواسطة', 'By', 'بذریعہ')), C.t('detail', L('التفاصيل', 'Details', 'تفصیل'))],
        rows: history.map((h) => ({ at: h.at, title: titleOf.get(h.link_id), event: label(lang, 'decision', h.event) === h.event ? label(lang, 'submission', h.event) : label(lang, 'decision', h.event), actor: h.actor, detail: h.detail })),
      },
    ],
  };
}

async function buildAuditExtract(ctx: ServiceContext, p: ReportParams): Promise<Built> {
  const { rows } = await ctx.db.query(
    `SELECT al.at, u.name AS actor, al.action, al.entity_type, al.entity_id, al.reason, al.after_value
       FROM qiyas.audit_log al LEFT JOIN public.users u ON u.id = al.actor_id
      WHERE ($1::timestamptz IS NULL OR al.at >= $1) AND ($2::timestamptz IS NULL OR al.at < $2)
        AND ($3::text IS NULL OR al.entity_type = $3) AND ($4::text IS NULL OR al.action ILIKE $4 || '%')
      ORDER BY al.at DESC LIMIT 5001`,
    [p.from ?? null, p.to ?? null, p.entityType || null, p.action || null]);
  const truncated = rows.length > 5000;
  return {
    summary: [{ label: L('السجلات', 'Records', 'ریکارڈ'), value: truncated ? '5000+' : rows.length }],
    sections: [{
      key: 'audit', title: L('سجل التدقيق', 'Audit log', 'آڈٹ لاگ'),
      note: truncated ? L('عُرضت أحدث 5000 سجل؛ ضيّق الفترة.', 'Showing the latest 5,000 records; narrow the period.', 'تازہ ترین 5000 ریکارڈ؛ مدت کم کریں۔') : undefined,
      columns: [C.dt('at', L('الوقت', 'Time', 'وقت')), C.t('actor', L('المستخدم', 'User', 'صارف')), C.code('action'),
        C.t('entityType', L('نوع السجل', 'Record type', 'ریکارڈ کی قسم')), C.code('entityId'), C.t('reason', L('السبب', 'Reason', 'وجہ')), C.t('details', L('التفاصيل', 'Details', 'تفصیل'))],
      rows: rows.slice(0, 5000).map((x) => ({ at: x.at, actor: x.actor ?? 'system', action: x.action, entityType: x.entity_type, entityId: x.entity_id, reason: x.reason,
        details: x.after_value ? JSON.stringify(x.after_value).slice(0, 300) : null })),
    }],
  };
}

const BUILDERS: Record<ReportCode, (ctx: ServiceContext, p: ReportParams, lang: Lang) => Promise<Built>> = {
  readiness: buildReadiness,
  'not-posted': buildNotPosted,
  'evidence-register': buildEvidenceRegister,
  'department-performance': buildDepartmentPerformance,
  'deadline-log': buildDeadlineLog,
  sla: buildSla,
  'requirement-dossier': buildDossier,
  'audit-extract': (ctx, p) => buildAuditExtract(ctx, p),
};

export async function generateReport(ctx: ServiceContext, code: ReportCode, params: ReportParams, lang: Lang, format: 'view' | 'xlsx' = 'view'): Promise<RenderedReport> {
  if (!REPORT_CODES.includes(code)) throw new ComplianceError('not_found', 'Unknown report');
  if (!(await mayRun(ctx, code))) throw new ComplianceError('forbidden', 'You cannot run this report');
  const cycle = await mustOne(ctx.db, 'cycle', 'SELECT id, name FROM qiyas.measurement_cycles WHERE id = $1', [params.cycleId]);
  const built = await BUILDERS[code](ctx, params, lang);
  await audit(ctx, { action: 'report.generated', entityType: 'cycle', entityId: cycle.id, after: { code, format, lang, params } });
  const def = REPORTS[code];
  return {
    code, lang, title: def.title[lang], subtitle: built.subtitle ?? null,
    cycle: { id: cycle.id, name: cycle.name }, asOf: ctx.now.toISOString(),
    summary: built.summary.map((s) => ({ label: s.label[lang], value: s.value, type: s.type ?? 'text' })),
    sections: built.sections.map((s) => ({
      key: s.key, title: s.title[lang], note: s.note?.[lang] ?? null,
      columns: s.columns.map((c) => ({ key: c.key, label: c.label[lang], type: c.type ?? 'text' })),
      rows: s.rows,
    })),
  };
}
