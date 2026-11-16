/**
 * Phase 1 API, mounted at /api/v2. Thin layer over the tested services:
 * parse the request, call one service inside a transaction, return JSON.
 */
import express, { RequestHandler, Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as admin from '../admin/admin';
import { removeLogo, setLogo } from '../admin/branding';
import { ComplianceError, audit, mustOne } from '../core/context';
import { can } from '../domain/permissions';
import { EvidenceDeps, linkEvidence, submitEvidence, uploadEvidence, withdrawEvidence } from '../evidence/evidence';
import { acceptEvidence, claimEvidence, rejectEvidence, releaseEvidence, revokeEvidence } from '../evidence/review';
import { createPackage, markNotPosted, markPosted, reuseEvidence, searchBank } from '../evidence/submission';
import { activateFramework, createCycle, importFramework, setApplicability, transitionCycle } from '../framework/frameworkService';
import { importCrosswalk } from '../framework/crosswalk';
import { carryOver, carryOverPreview, dismissSuggestion, taskSuggestions, useSuggestion } from '../evidence/suggestions';
import { finishImport, importDetail, importFile, listImports, startImport } from '../evidence/folderImport';
import { LIBRARY_KINDS, addLibraryDocument, libraryFile, listLibrary, syncLibrary, uploadLibraryFile } from '../library/library';
import { answerClarification, cancelClarification, closeClarification, followUpClarification, requestClarification } from '../work/clarifications';
import { escalateManually } from '../work/escalations';
import { approveExtension, askForMoreTime, declineAsk, forwardAsk, rejectExtension, requestExtension, withdrawExtension } from '../work/extensions';
import { assignTask, cancelAssignment, createAssignment, publishAssignment, startTask } from '../work/tasks';
import { ApiOptions, AuthedRequest, FileResponse, parse, route } from './http';
import * as q from './queries';
import { pageFromQuery } from './paging';
import { REPORT_CODES, ReportCode, availableReports, generateReport } from '../reports/reports';
import { reportToXlsx } from '../reports/xlsx';

const id = z.string().uuid();
const date = z.coerce.date();
const text = (min = 1) => z.string().trim().min(min);
const reason = z.object({ reason: text(3) });

export interface ComplianceApiOptions extends ApiOptions {
  authenticate: RequestHandler;
  evidence: EvidenceDeps;
  maxUploadMb?: number;
}

export function createComplianceRouter(opts: ComplianceApiOptions): Router {
  const r = Router();
  r.use(express.json({ limit: '10mb' }));
  r.use(opts.authenticate);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: (opts.maxUploadMb ?? 50) * 1024 * 1024, files: 1 } });
  const get = (path: string, h: Parameters<typeof route>[1]) => r.get(path, route(opts, h));
  const post = (path: string, h: Parameters<typeof route>[1], status = 200) => r.post(path, route(opts, h, status));
  const p = (req: AuthedRequest, name: string) => parse(id, req.params[name]);
  // multer decodes multipart file names as latin1; restore UTF-8 (Arabic and Urdu names)
  const utf8Name = (name: string) => Buffer.from(name, 'latin1').toString('utf8');
  const uploaded = (req: AuthedRequest) => (req as AuthedRequest & { file?: Express.Multer.File }).file;

  // ---- me
  get('/me', (ctx) => q.me(ctx));
  r.put('/me/language', route(opts, (ctx, req) => admin.setMyLanguage(ctx, parse(z.object({ language: z.enum(['ar', 'en', 'ur']) }), req.body).language)));

  // ---- framework & cycles
  post('/frameworks', async (ctx, req) => { const out = await importFramework(ctx, req.body); await syncLibrary(ctx.db); return out; }, 201);
  post('/frameworks/crosswalk', (ctx, req) => importCrosswalk(ctx, req.body), 201);
  get('/frameworks', async (ctx) => (await ctx.db.query(`SELECT id, issuer, document_code, version, published_on, title_ar, title_en, title_ur, status
     FROM qiyas.framework_versions ORDER BY published_on DESC`)).rows);
  post('/frameworks/:id/activate', (ctx, req) => activateFramework(ctx, p(req, 'id')));
  get('/cycles', (ctx) => q.listCycles(ctx));
  post('/cycles', (ctx, req) => createCycle(ctx, parse(z.object({
    frameworkVersionId: id, year: z.number().int(), name: text(), startsOn: z.string(), endsOn: z.string(), internalTargetOn: z.string().nullish(),
  }), req.body)), 201);
  post('/cycles/:id/transition', (ctx, req) => {
    const b = parse(z.object({ event: z.enum(['open', 'close', 'reopen', 'archive']), reason: z.string().optional() }), req.body);
    return transitionCycle(ctx, p(req, 'id'), b.event, b.reason);
  });
  get('/cycles/:id/readiness', (ctx, req) => q.cycleReadiness(ctx, p(req, 'id')));
  r.patch('/cycle-requirements/:id/applicability', route(opts, (ctx, req) => {
    const b = parse(z.object({ applicable: z.boolean(), reason: z.string().optional() }), req.body);
    return setApplicability(ctx, p(req, 'id'), b.applicable, b.reason);
  }));

  // ---- organization
  get('/departments', (ctx) => q.listDepartments(ctx));
  get('/departments/:id/members', (ctx, req) => q.departmentMembers(ctx, p(req, 'id')));

  // ---- assignments & tasks
  post('/assignments', (ctx, req) => createAssignment(ctx, parse(z.object({
    cycleId: id, departmentId: id, cycleRequirementIds: z.array(id).min(1), title: text(), instructions: z.string().optional(),
    priority: z.enum(['critical', 'high', 'medium', 'low']).optional(), implementationDueAt: date, managerDueAt: date,
  }), req.body)).then((assignmentId) => ({ assignmentId })), 201);
  post('/assignments/:id/publish', (ctx, req) => publishAssignment(ctx, p(req, 'id')).then((taskId) => ({ taskId })));
  post('/assignments/:id/cancel', (ctx, req) => cancelAssignment(ctx, p(req, 'id'), parse(reason, req.body).reason));
  get('/tasks', (ctx, req) => q.listTasks(ctx, {
    cycleId: req.query.cycleId ? parse(id, req.query.cycleId) : undefined,
    mine: req.query.mine === 'true',
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    open: req.query.open === 'true',
  }, pageFromQuery(req.query)));
  get('/tasks/:id', (ctx, req) => q.taskDetail(ctx, p(req, 'id')));
  post('/tasks/:id/assign', (ctx, req) => {
    const b = parse(z.object({ assigneeId: id, note: z.string().optional() }), req.body);
    return assignTask(ctx, p(req, 'id'), b.assigneeId, b.note).then((t) => ({ ownerId: t.current_owner_id, status: t.execution_status }));
  });
  post('/tasks/:id/start', (ctx, req) => startTask(ctx, p(req, 'id')));
  post('/tasks/:id/escalate', (ctx, req) => escalateManually(ctx, p(req, 'id'), parse(reason, req.body).reason));

  // ---- clarifications
  post('/tasks/:id/clarifications', (ctx, req) => requestClarification(ctx, p(req, 'id'), parse(z.object({
    question: text(), cycleRequirementId: id.nullish(), proofItemId: id.nullish(),
  }), req.body)).then((clarificationId) => ({ clarificationId })), 201);
  post('/clarifications/:id/answer', (ctx, req) => answerClarification(ctx, p(req, 'id'), parse(z.object({ body: text() }), req.body).body).then((answeredAs) => ({ answeredAs })));
  post('/clarifications/:id/follow-up', (ctx, req) => followUpClarification(ctx, p(req, 'id'), parse(z.object({ body: text() }), req.body).body));
  post('/clarifications/:id/close', (ctx, req) => closeClarification(ctx, p(req, 'id')));
  post('/clarifications/:id/cancel', (ctx, req) => cancelClarification(ctx, p(req, 'id')));

  // ---- extensions
  const ask = z.object({ requestedDueAt: date, justification: text(3) });
  post('/tasks/:id/more-time', (ctx, req) => { const b = parse(ask, req.body); return askForMoreTime(ctx, p(req, 'id'), b.requestedDueAt, b.justification).then((askId) => ({ askId })); }, 201);
  post('/extension-asks/:id/forward', (ctx, req) => {
    const b = parse(z.object({ requestedDueAt: date.optional(), justification: z.string().optional() }), req.body);
    return forwardAsk(ctx, p(req, 'id'), b).then((requestId) => ({ requestId }));
  });
  post('/extension-asks/:id/decline', (ctx, req) => declineAsk(ctx, p(req, 'id'), parse(reason, req.body).reason));
  post('/tasks/:id/extensions', (ctx, req) => { const b = parse(ask, req.body); return requestExtension(ctx, p(req, 'id'), b.requestedDueAt, b.justification).then((requestId) => ({ requestId })); }, 201);
  post('/extensions/:id/approve', (ctx, req) => approveExtension(ctx, p(req, 'id'), parse(z.object({ approvedDueAt: date.optional() }), req.body).approvedDueAt).then((dueAt) => ({ dueAt })));
  post('/extensions/:id/reject', (ctx, req) => rejectExtension(ctx, p(req, 'id'), parse(reason, req.body).reason));
  post('/extensions/:id/withdraw', (ctx, req) => withdrawExtension(ctx, p(req, 'id')));
  get('/inbox', (ctx) => q.inbox(ctx));

  // ---- evidence
  r.post('/tasks/:id/evidence', upload.single('file'), route(opts, (ctx, req) => {
    const b = parse(z.object({
      artifactId: id.optional(), title: z.string().optional(), kind: z.enum(['file', 'screenshot', 'report', 'data_export', 'link', 'other']).optional(),
      description: z.string().optional(), externalUrl: z.string().optional(), documentDate: z.string().optional(), approvingAuthority: z.string().optional(),
    }), req.body ?? {});
    const f = uploaded(req);
    const filename = f ? utf8Name(f.originalname) : undefined;
    return uploadEvidence(ctx, opts.evidence, { ...b, taskId: p(req, 'id'), file: f ? { content: f.buffer, filename: filename!, mimeType: f.mimetype } : undefined });
  }, 201));
  post('/evidence-versions/:id/links', (ctx, req) => linkEvidence(ctx, p(req, 'id'), parse(z.object({
    taskId: id, cycleRequirementId: id, proofItemId: id.nullish(),
  }), req.body)).then((linkId) => ({ linkId })), 201);
  post('/tasks/:id/submit', (ctx, req) => submitEvidence(ctx, p(req, 'id'), parse(z.object({ linkIds: z.array(id).optional() }), req.body ?? {}).linkIds).then((submitted) => ({ submitted })));
  post('/evidence-links/:id/withdraw', (ctx, req) => withdrawEvidence(ctx, p(req, 'id')));
  get('/evidence-versions/:id/download', async (ctx, req) => {
    const v = await mustOne(ctx.db, 'evidence', `SELECT v.storage_key, v.original_filename, v.mime_type, v.external_url, v.scan_status, v.uploaded_by, a.department_id,
        EXISTS (SELECT 1 FROM qiyas.evidence_links l WHERE l.artifact_version_id = v.id AND l.review_status = 'accepted') AS accepted,
        COALESCE((SELECT array_agg(DISTINCT o) FROM (
            SELECT t.current_owner_id AS o FROM qiyas.evidence_links l JOIN qiyas.tasks t ON t.id = l.task_id WHERE l.artifact_version_id = v.id
            UNION -- owners of tasks the file is suggested for may open it before linking it (BNK-5)
            SELECT t.current_owner_id FROM qiyas.link_suggestions sg
              JOIN qiyas.task_requirements tr ON tr.cycle_requirement_id = sg.cycle_requirement_id
              JOIN qiyas.tasks t ON t.id = tr.task_id
             WHERE sg.artifact_version_id = v.id AND sg.status = 'open') x), '{}') AS owners
       FROM qiyas.artifact_versions v JOIN qiyas.artifacts a ON a.id = v.artifact_id WHERE v.id = $1`, [p(req, 'id')]);
    if (!can(ctx.actor.effective, ctx.actor.userId, 'evidence.download', { departmentId: v.department_id, ownerIds: [v.uploaded_by, ...v.owners], isAccepted: v.accepted })) {
      throw new ComplianceError('forbidden', 'You cannot download this evidence');
    }
    if (v.scan_status !== 'clean') throw new ComplianceError('conflict', 'This file is not available (virus scan)');
    if (!v.storage_key) throw new ComplianceError('validation', 'This evidence is a link, not a file');
    await audit(ctx, { action: 'evidence.downloaded', entityType: 'artifact_version', entityId: p(req, 'id') });
    return new FileResponse(await opts.evidence.storage.get(v.storage_key), v.original_filename ?? 'evidence', v.mime_type);
  });

  // ---- review
  get('/review-queue', (ctx, req) => q.reviewQueue(ctx, req.query.cycleId ? parse(id, req.query.cycleId) : undefined, pageFromQuery(req.query)));
  post('/evidence-links/:id/claim', (ctx, req) => claimEvidence(ctx, p(req, 'id')));
  post('/evidence-links/:id/release', (ctx, req) => releaseEvidence(ctx, p(req, 'id')));
  post('/evidence-links/:id/accept', (ctx, req) => { const b = parse(z.object({ comment: z.string().optional(), checklist: z.unknown().optional() }), req.body ?? {}); return acceptEvidence(ctx, p(req, 'id'), b.comment, b.checklist); });
  post('/evidence-links/:id/reject', (ctx, req) => rejectEvidence(ctx, p(req, 'id'), parse(z.object({ comment: z.string() }), req.body).comment));
  post('/evidence-links/:id/revoke', (ctx, req) => revokeEvidence(ctx, p(req, 'id'), parse(reason, req.body).reason));

  // ---- DGA submission & banks
  get('/cycles/:id/submission-queue', (ctx, req) => q.submissionQueue(ctx, p(req, 'id'), req.query.status === 'posted' || req.query.status === 'not_posted' ? req.query.status : undefined, pageFromQuery(req.query)));
  post('/submission/post', (ctx, req) => { const b = parse(z.object({ linkIds: z.array(id).min(1), dgaReference: z.string().optional() }), req.body); return markPosted(ctx, b.linkIds, { dgaReference: b.dgaReference }).then((posted) => ({ posted })); });
  post('/evidence-links/:id/unpost', (ctx, req) => markNotPosted(ctx, p(req, 'id'), parse(reason, req.body).reason));
  post('/submission/packages', (ctx, req) => { const b = parse(z.object({ cycleId: id, title: text(), linkIds: z.array(id).min(1) }), req.body); return createPackage(ctx, b.cycleId, b.title, b.linkIds).then((packageId) => ({ packageId })); }, 201);
  get('/cycles/:id/bank', (ctx, req) => searchBank(ctx, {
    cycleId: p(req, 'id'), text: typeof req.query.text === 'string' ? req.query.text : undefined,
    standardCode: typeof req.query.standardCode === 'string' ? req.query.standardCode : undefined, acceptedOnly: req.query.acceptedOnly === 'true',
  }, pageFromQuery(req.query)));
  post('/bank/reuse', (ctx, req) => { const b = parse(z.object({ sourceVersionId: id, targetCycleId: id, title: z.string().optional() }), req.body); return reuseEvidence(ctx, b.sourceVersionId, b.targetCycleId, b.title); }, 201);

  // ---- carry-over and suggestions (BNK-5)
  get('/cycles/:id/carry-over', (ctx, req) => carryOverPreview(ctx, p(req, 'id'), parse(id, req.query.sourceCycleId)));
  post('/cycles/:id/carry-over', (ctx, req) => { const b = parse(z.object({ sourceCycleId: id, versionIds: z.array(id).optional() }), req.body); return carryOver(ctx, p(req, 'id'), b.sourceCycleId, b.versionIds); });
  get('/tasks/:id/suggestions', (ctx, req) => taskSuggestions(ctx, p(req, 'id')));
  post('/suggestions/:id/use', (ctx, req) => useSuggestion(ctx, p(req, 'id'), parse(z.object({ taskId: id }), req.body).taskId).then((linkId) => ({ linkId })), 201);
  post('/suggestions/:id/dismiss', (ctx, req) => dismissSuggestion(ctx, p(req, 'id'), parse(z.object({ taskId: id }), req.body).taskId));

  // ---- folder import
  get('/cycles/:id/imports', (ctx, req) => listImports(ctx, p(req, 'id')));
  post('/cycles/:id/imports', (ctx, req) => { const b = parse(z.object({ label: text(), codesFrameworkVersionId: id.optional() }), req.body); return startImport(ctx, p(req, 'id'), b).then((batchId) => ({ batchId })); }, 201);
  r.post('/imports/:id/files', upload.single('file'), route(opts, (ctx, req) => {
    const f = uploaded(req);
    if (!f) throw new ComplianceError('validation', 'Attach a file');
    const b = parse(z.object({ relativePath: text() }), req.body ?? {});
    return importFile(ctx, opts.evidence, p(req, 'id'), { relativePath: b.relativePath, content: f.buffer, mimeType: f.mimetype });
  }, 201));
  post('/imports/:id/finish', (ctx, req) => finishImport(ctx, p(req, 'id')));
  get('/imports/:id', (ctx, req) => importDetail(ctx, p(req, 'id')));

  // ---- regulations library
  get('/library', (ctx, req) => listLibrary(ctx, {
    text: typeof req.query.text === 'string' ? req.query.text : undefined,
    kind: typeof req.query.kind === 'string' ? parse(z.enum(LIBRARY_KINDS), req.query.kind) : undefined,
    standardId: req.query.standardId ? parse(id, req.query.standardId) : undefined,
    frameworkVersionId: req.query.frameworkVersionId ? parse(id, req.query.frameworkVersionId) : undefined,
  }, pageFromQuery(req.query)));
  post('/library', (ctx, req) => addLibraryDocument(ctx, parse(z.object({
    kind: z.enum(LIBRARY_KINDS), titleAr: text(), titleEn: text(), issuer: z.string().optional(), version: z.string().optional(),
    issuedOn: z.string().optional(), externalUrl: z.string().optional(), standardCodes: z.array(z.string()).optional(), frameworkVersionId: id.optional(),
  }), req.body)).then((documentId) => ({ documentId })), 201);
  r.post('/library/:id/file', upload.single('file'), route(opts, (ctx, req) => {
    const f = uploaded(req);
    if (!f) throw new ComplianceError('validation', 'Attach a file');
    return uploadLibraryFile(ctx, opts.evidence, p(req, 'id'), { content: f.buffer, filename: utf8Name(f.originalname), mimeType: f.mimetype });
  }));
  get('/library/:id/file', async (ctx, req) => {
    const f = await libraryFile(ctx, p(req, 'id'));
    return new FileResponse(await opts.evidence.storage.get(f.key), f.filename, f.mimeType);
  });

  // ---- reports (docs 08 §6): the same data on screen, printed to PDF, or as Excel
  const lang = z.enum(['ar', 'en', 'ur']).default('ar');
  get('/reports', (ctx, req) => availableReports(ctx, parse(lang, req.query.lang) ?? 'ar'));
  get('/reports/:code', async (ctx, req) => {
    const code = parse(z.enum(REPORT_CODES), req.params.code) as ReportCode;
    const qs = parse(z.object({
      cycleId: id, lang, format: z.enum(['view', 'xlsx']).default('view'), cycleRequirementId: id.optional(),
      from: z.string().optional(), to: z.string().optional(), entityType: z.string().optional(), action: z.string().optional(),
    }), req.query);
    const report = await generateReport(ctx, code, qs, qs.lang ?? 'ar', qs.format ?? 'view');
    if (qs.format === 'view') return report;
    const day = report.asOf.slice(0, 10);
    return new FileResponse(await reportToXlsx(report, ctx.calendar.utcOffsetMinutes), `${report.title} - ${report.cycle?.name ?? ''} - ${day}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  // ---- notifications
  get('/notifications', (ctx, req) => q.listNotifications(ctx, pageFromQuery(req.query)));
  post('/notifications/read', (ctx, req) => {
    const b = parse(z.object({ ids: z.union([z.array(id), z.literal('all')]) }), req.body);
    return admin.markNotificationsRead(ctx, b.ids).then((updated) => ({ updated }));
  });
  r.put('/notifications/mutes', route(opts, (ctx, req) => {
    const b = parse(z.object({ eventCode: text(), channel: z.enum(['in_app', 'email']), muted: z.boolean() }), req.body);
    return admin.setMute(ctx, b.eventCode, b.channel, b.muted);
  }));

  // ---- administration
  get('/admin/users', (ctx, req) => admin.listUsers(ctx, pageFromQuery(req.query), typeof req.query.text === 'string' ? req.query.text : undefined));
  post('/admin/departments', (ctx, req) => admin.createDepartment(ctx, parse(z.object({ code: text(), nameAr: text(), nameEn: text(), parentId: id.nullish() }), req.body)).then((departmentId) => ({ departmentId })), 201);
  r.patch('/admin/departments/:id', route(opts, (ctx, req) => admin.updateDepartment(ctx, p(req, 'id'), parse(z.object({
    nameAr: z.string().optional(), nameEn: z.string().optional(), isActive: z.boolean().optional(), parentId: id.nullish(),
  }), req.body))));
  r.put('/admin/departments/:id/manager', route(opts, (ctx, req) => admin.setDepartmentManager(ctx, p(req, 'id'), parse(z.object({ userId: id }), req.body).userId)));
  post('/admin/departments/:id/members', (ctx, req) => admin.addDepartmentMember(ctx, p(req, 'id'), parse(z.object({ userId: id }), req.body).userId), 201);
  r.delete('/admin/departments/:id/members/:userId', route(opts, (ctx, req) => admin.removeDepartmentMember(ctx, p(req, 'id'), p(req, 'userId'))));
  post('/admin/role-grants', (ctx, req) => {
    const b = parse(z.object({ userId: id, role: z.enum(['QC', 'DM', 'EMP', 'DSO', 'EXE', 'ADM']), departmentId: id.nullish() }), req.body);
    return admin.grantRole(ctx, b.userId, b.role, b.departmentId ?? null).then((grantId) => ({ grantId }));
  }, 201);
  r.delete('/admin/role-grants/:id', route(opts, (ctx, req) => admin.revokeGrant(ctx, p(req, 'id'), typeof req.body?.reason === 'string' ? req.body.reason : undefined)));
  r.put('/admin/groups/:code/members', route(opts, (ctx, req) => admin.setGroupMembers(ctx, parse(text(), req.params.code), parse(z.object({ userIds: z.array(id) }), req.body).userIds)));
  get('/admin/sla-policies', async (ctx) => { if (!can(ctx.actor.effective, ctx.actor.userId, 'admin.sla_policies')) throw new ComplianceError('forbidden', 'Missing permission admin.sla_policies'); return (await ctx.db.query('SELECT * FROM qiyas.sla_policies ORDER BY timer_kind')).rows; });
  r.patch('/admin/sla-policies/:kind', route(opts, (ctx, req) => admin.updateSlaPolicy(ctx, parse(text(), req.params.kind), parse(z.object({
    durationBusinessDays: z.number().int().min(0).nullish(), reminderDays: z.array(z.number().int().min(0)).optional(),
    escalationAfterBusinessDays: z.number().int().min(0).optional(), repeatEveryBusinessDays: z.number().int().min(1).nullish(), isActive: z.boolean().optional(),
  }), req.body))));
  r.post('/admin/settings/logo', upload.single('file'), route(opts, (ctx, req) => {
    const f = uploaded(req);
    if (!f) throw new ComplianceError('validation', 'Attach an image');
    return setLogo(ctx, opts.evidence, { content: f.buffer, filename: utf8Name(f.originalname) });
  }));
  r.delete('/admin/settings/logo', route(opts, (ctx) => removeLogo(ctx)));
  r.put('/admin/settings', route(opts, (ctx, req) => admin.saveOrgSettings(ctx, parse(z.object({ nameAr: text(), nameEn: text(), defaultLanguage: z.enum(['ar', 'en', 'ur']).optional() }), req.body))));

  return r;
}
