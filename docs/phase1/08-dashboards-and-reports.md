# 08 · Dashboards & Reporting — Phase 1

[← Index](README.md)

All dashboards are scoped to the **selected measurement cycle** (default: the active one) and to the viewer's permissions. Every figure is clickable down to the underlying list, and shows its "as of" time. Readiness never counts uploads, only **accepted** evidence on **applicable** requirements.

## 1. Executive dashboard (EXE, QC, DSO)

Purpose: answer for top management *"are we ready, what is still not posted, and who is late?"*

| Widget | Content |
|---|---|
| **Readiness** | Cycle readiness % (ready ÷ applicable requirements), with counts: ready / in progress / not started / not applicable |
| **Posting** | Accepted links posted ÷ accepted links; count of **not posted** |
| **Readiness vs posting by perspective** | Two bars per perspective (internal readiness, posted share); drill to axis → standard → requirement |
| **What is not posted yet** | Requirements whose accepted evidence is not fully posted, with age since acceptance and posting deadline |
| **Overdue work** | Counts and lists by type: implementation, manager assignment, review, clarification, extension decision, posting |
| **Escalations** | Manual vs automatic, this week / this cycle, by department |
| **Department league** | Per department: assigned requirements, ready %, overdue tasks, escalations, average days to submit |
| **Timeline per evidence** | For any requirement or link: assigned → submitted → reviewed → accepted → posted, with original vs current deadlines and every extension and escalation |
| **Cycle clock** | Days until the cycle's internal target date and DGA's submission window (dates are cycle settings) |

## 2. Consultant dashboard (QC)

| Widget | Content |
|---|---|
| My queues | Links to review (with review deadline), open clarifications, pending extension decisions — each sorted by due date |
| Not yet assigned | Applicable requirements not covered by any assignment |
| Awaiting department action | Assignments where the manager has not assigned an executor (manager deadline) |
| At risk | Tasks due in ≤ 3 business days with no submitted evidence |
| Overdue & escalations | Overdue tasks, with one-click manual escalation (reason required) |
| Rejection hotspots | Requirements and departments with repeated rejections |
| Reuse opportunities | Current requirements with accepted evidence in earlier banks (via crosswalk) |
| My own SLA | My review / clarification / extension decision performance against deadlines |

## 3. Department manager dashboard (DM)

| Widget | Content |
|---|---|
| Inbox | New assignments to distribute (manager deadline), escalated tasks, tasks returned for rework, employees' requests for more time (D7) |
| Team board | Tasks by owner and execution status, with original vs current deadline |
| Deadlines | Due this week, overdue, paused (with reason), extension requests and their outcome |
| Clarifications | Ones I asked (answers come to me); my team's open questions, which I can answer myself (D4) |
| Department readiness | Readiness % of requirements assigned to my department |

## 4. Employee dashboard (EMP)

| Widget | Content |
|---|---|
| My tasks | Sorted by deadline; status, original vs current deadline, paused / overdue markers; ask my manager for more time |
| What is needed | Per task: requirements, expected proof items, instructions, checklist |
| Returned to me | Rejected evidence with the consultant's comments |
| My clarifications | Questions and answers |

## 5. DGA Submission Officer dashboard (DSO)

| Widget | Content |
|---|---|
| Ready to post | Accepted links not posted, grouped by perspective → standard, oldest first, with posting deadline |
| Posted evidence changed | Posted links later revoked or superseded — need re-posting |
| Posting progress | Posted ÷ accepted, per perspective and standard |
| Packages | Packages prepared, contents, download |

## 6. Reports (exportable PDF and Excel, in the chosen language)

| Report | Audience | Content |
|---|---|---|
| **Cycle readiness report** | EXE, QC | Readiness by perspective / axis / standard / requirement; applicability with reasons |
| **Not-posted register** | EXE, DSO | Accepted evidence not yet posted, age, owner |
| **Evidence register** | QC, DSO | Every link: artifact, version, requirement, review status and decision, submission status |
| **Department performance** | EXE, QC, DM (own dept) | Assignments, on-time rate, extensions, escalations, rejections, cycle times |
| **Deadline & escalation log** | EXE, QC | All deadline changes, extension decisions, escalations with reasons |
| **Consultant & officer SLA report** | EXE, Compliance Oversight | Review, clarification, extension and posting timeliness |
| **Requirement dossier** | QC, DSO | One requirement: text, proof items, all evidence with versions and full decision history |
| **Audit extract** | ADM, QC | Filtered audit log for an entity or period |

Report rules: generated asynchronously; the report shows the cycle and the "data as of" timestamp; files are kept for 30 days (configurable); each generation is audited.

## 7. Metrics definitions

| Metric | Definition |
|---|---|
| Readiness % | ready applicable requirements ÷ applicable requirements |
| Posting % | posted accepted links ÷ accepted links |
| On-time submission rate | tasks first submitted on or before `current_due_at` ÷ tasks submitted |
| Original-deadline adherence | tasks first submitted on or before `original_due_at` ÷ tasks submitted |
| First-pass acceptance | links accepted on first review ÷ links reviewed |
| Average review time | mean business days from *submitted* to decision |
| Average posting time | mean business days from *accepted* to *posted* |
| Escalation rate | escalated tasks ÷ tasks (split manual / automatic) |
