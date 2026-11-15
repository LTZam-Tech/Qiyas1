# Qiyas — Phase 1 Specification

**Status:** Draft for approval · **Date:** 2026-11-15 · **Framework reference:** DGA *Basic Digital Transformation Standards* v5.0 (DGA-1-2-1-111)

These documents describe Phase 1 of Qiyas as confirmed by the business on 2026-11-15:
an **internal compliance management system**, deployed **on-premises, one installation per government client**, that manages readiness, evidence collection, review, acceptance and DGA submission preparation for the annual DGA *Qiyas* measurement cycle.

> Where these documents conflict with `PRD.md`, `docs/PRD.md`, `docs/BUSINESS_RULES.md`, `docs/DATA_MODEL.md` or `docs/USER_STORIES.md`, **these documents win.** No implementation starts until they are approved.

## Deliverables

| # | Document | What it answers |
|---|---|---|
| 1 | [Business Requirements](01-business-requirements.md) | What the system must do, as numbered requirements |
| 2 | [Role & Permission Matrix](02-roles-and-permissions.md) | Who can do what, and in which scope |
| 3 | [End-to-End Workflows](03-workflows.md) | How work moves between people, as diagrams |
| 4 | [Workflow State Machines](04-state-machines.md) | Every status, every allowed transition, who triggers it |
| 5 | [Entity Relationship Diagram](05-erd.md) | The data model |
| 6 | [Evidence Bank Data Model](06-evidence-bank.md) | Annual banks, versions, reuse and lineage |
| 7 | [Notification & Escalation Rules](07-notifications-and-escalation.md) | Deadlines, reminders, escalations, recipients |
| 8 | [Dashboards & Reporting](08-dashboards-and-reports.md) | What each audience sees |
| 9 | [On-Premises Deployment](09-deployment.md) | How one client installation is built and run |
| 10 | [Phase 1 Scope & Exclusions](10-scope.md) | What is in, what is out, what comes later |

## The five ideas everything else rests on

1. **The framework is data, not code.** Perspectives, axes, standards, application requirements and expected proof documents are imported per DGA version. A measurement cycle points at one framework version. Nothing about 2026 or v5.0 is hardcoded.
2. **The business chain is** Perspective → Axis → Standard → Application Requirement → Evidence. A standard has many requirements; a requirement expects one or more proof items; an artifact can serve several requirements.
3. **Evidence is its own entity with its own lifecycle**, owned and versioned, living in the evidence bank of one cycle. It is never a field on a task.
4. **Three statuses never merge** (see below).
5. **Every cycle is independent.** Its own bank, assignments, deadlines, reviews and completeness. Old evidence can be *reused as a starting point* but is always re-reviewed.

## Shared vocabulary

| Term | Meaning |
|---|---|
| **Framework version** | One published edition of the DGA standards (e.g. v5.0), imported as data |
| **Measurement cycle** | One annual Qiyas round inside this installation (e.g. *Qiyas 2026 / v5.0*) |
| **Requirement** | A DGA *application requirement* (متطلب التطبيق) of a standard |
| **Expected evidence item** | A proof document the standard asks for (مستند إثبات), linked to one or more requirements |
| **Assignment** | The consultant handing one or more requirements to a department, with deadlines |
| **Task** | The unit of work inside a department, owned by one executor at a time |
| **Executor** | Whoever currently owns a task: an employee, or the department manager |
| **Artifact** | A managed piece of evidence (file, screenshot, report, link) in a cycle's evidence bank |
| **Artifact version** | One uploaded file of an artifact; versions are never overwritten |
| **Evidence link** | An artifact version mapped to a requirement (and optionally an expected item) within a cycle. **The unit of review and of DGA posting.** |
| **Applicable** | A requirement the client must satisfy in this cycle. Not-applicable requirements are excluded from completeness, with a recorded reason |

## The three independent statuses

| Status | Lives on | Values | Changed by |
|---|---|---|---|
| **Task execution status** | Task | draft · awaiting assignment · assigned · in progress · submitted · rework required · completed · cancelled | Manager, executor, system |
| **Evidence review status** | Evidence link | draft · submitted · under review · accepted · rejected · withdrawn · revoked · superseded | Executor (submit, withdraw), consultant (decide, revoke), system (supersede) |
| **Evidence submission status** | Evidence link | not posted · posted | DGA Submission Officer |

Escalation, overdue, open clarification and pending extension are **flags and records**, not statuses. Full transitions are in [04](04-state-machines.md).

## Business decisions

Confirmed by the business on 2026-11-15. Documents reference them as **(Dn)**.

| ID | Question | Decision |
|---|---|---|
| D1 | Does an open clarification pause the executor's deadline? | **Yes.** The implementation deadline pauses from the moment a clarification is raised until it is answered. |
| D2 | When a task already owned by the department manager hits its deadline, who receives the automatic escalation? | **The manager himself.** Ownership stays with him; the escalation is recorded and sent to him. |
| D3 | May one person hold both the Qiyas Consultant and DGA Submission Officer roles? | **No.** The two roles can never be held by the same person. **The consultant can attach any evidence, like a normal employee.** |
| D4 | Can the department manager see a clarification raised by an employee? | **Yes, and the manager can answer it too**, so the employee is not left waiting for the consultant. |
| D5 | Is "consultant rejection and feedback" a separate deadline from review? | **No, the same deadline.** The consultant's review deadline covers the decision and its feedback. There is no separate rework deadline. |
| D6 | Is top management a separate read-only role? | **Yes:** *Executive Viewer*. |
| D7 | Can employees ask their manager for more time inside the system? | **Yes.** The manager then raises the formal request to the consultant, or declines it. |
| D8 | Is there a client-side System Administrator role? | **Not for now.** Administration is performed by the system administrator (the installation's operator). The role exists and can be granted to client staff later from the system-administrator side. |
| D9 | When a consultant attaches evidence himself (D3), who reviews it? | **Another consultant.** Every role is held by several people (e.g. Alaa and Ahmad are consultants; Yousef and Jan are submission officers). The consultant who uploaded a piece of evidence is never the one who reviews it. |

**Roles are shared by several people.** Work queues (reviews, clarifications, extension decisions, posting) are shared by everyone holding the role. A person *claims* an item to work on it so two people don't act on it at once. No open decisions remain.

## What this changes in today's code

The current build (single status per task, `dean`/`vice_dean` roles, global hierarchy without versions, evidence as task attachments) does not match these decisions. [10 · Scope](10-scope.md#impact-on-the-current-build) lists the gaps. Implementation will follow approval of these documents.
