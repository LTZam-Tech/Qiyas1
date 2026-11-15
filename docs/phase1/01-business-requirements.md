# 01 · Business Requirements Document — Phase 1

[← Index](README.md)

## 1. Purpose

Qiyas helps a government entity prepare for the DGA *Qiyas* digital-transformation measurement. It organizes the work of finding, producing, reviewing and approving the evidence each DGA requirement asks for, and tracks which approved evidence has been posted on the DGA portal.

Phase 1 covers **internal readiness only**. It does not record DGA's own verification results or scores (see [10 · Scope](10-scope.md)).

## 2. Context: how DGA structures the measurement

From DGA *Basic Digital Transformation Standards* v5.0 (DGA-1-2-1-111):

- **10 perspectives → 24 axes → 89 standards.**
- Each standard card contains: the standard text, its goal, **application requirements** (sequential, alternative, or step-based conditions), **proof documents** (reports, documents, plans, templates, certificates, screenshots, links), related decrees and circulars, and a **scope** naming the government bodies it applies to.
- DGA rules for acceptable proof include: documents approved and signed by the competent authority; reports and studies dated within the cycle; documents over 20 pages carry a table of contents pointing to each requirement; images clear enough to verify; links supplied for published online content.

These structures change between DGA versions. **The system imports them as data per version** (BR-FW).

## 3. Actors

| Actor | Summary |
|---|---|
| **Qiyas Consultant** | Runs the internal compliance programme: distributes requirements to departments, clarifies, sets and monitors deadlines, decides extensions, escalates, reviews evidence |
| **Department Manager** | Owns the department's assignments; assigns to employees or self; requests extensions; handles escalated and rejected work |
| **Employee (Executor)** | Produces and uploads evidence for assigned tasks; asks for clarification; reworks rejected evidence |
| **DGA Submission Officer** | Receives accepted evidence, prepares the DGA package, records posted / not posted |
| **Executive Viewer** (D6) | Top management: read-only dashboards and reports |
| **System Administrator** (D8) | Administration of users, departments, groups, roles, permissions and settings. In Phase 1 this is the installation's operator; the role can later be granted to client staff. |

All operational users belong to the client organization. **Each role is held by several people** (e.g. two consultants, two submission officers); their queues are shared and an item is *claimed* by one person while they act on it. The Qiyas Consultant and DGA Submission Officer roles are never held by the same person (D3). Full permissions: [02](02-roles-and-permissions.md).

## 4. Functional requirements

Each requirement has an ID for traceability to tests and code.

### BR-FW · Framework and cycles

| ID | Requirement |
|---|---|
| BR-FW-01 | The system stores DGA framework **versions** (e.g. v5.0) with their perspectives, axes, standards, application requirements and expected proof documents, all bilingual (Arabic, English; Urdu UI labels where available). |
| BR-FW-02 | A framework version is loaded through an **import** (structured file), validated before activation, and becomes read-only once used by a cycle. Corrections create a new revision with an audit record. |
| BR-FW-03 | Requirements store their type (sequential, alternative, step), order, and their links to expected proof documents (many-to-many). |
| BR-FW-04 | A **measurement cycle** has a name, year, framework version, start/end dates, and a lifecycle (planning → active → closed → archived). Several cycles may exist; normally one is active. |
| BR-FW-05 | When a new framework version is imported, the consultant can record a **crosswalk** from old requirements to new ones (same / changed / new / removed) to guide reuse. |
| BR-FW-06 | The consultant marks each requirement of a cycle as **applicable** or **not applicable** (mandatory reason and optional supporting document). Not-applicable requirements are excluded from completeness. Changes are audited. |
| BR-FW-07 | Nothing in the application logic depends on a specific year, version, number of perspectives, or requirement count. |

### BR-ASG · Assignment and tasks

| ID | Requirement |
|---|---|
| BR-ASG-01 | The consultant assigns one or more requirements of a cycle to **one department**, with: instructions/description, implementation deadline, manager action deadline, and priority. A requirement may be assigned to more than one department when needed; each assignment is tracked separately. |
| BR-ASG-02 | An assignment creates a **task** owned by the department manager with execution status *awaiting assignment*. |
| BR-ASG-03 | The department manager assigns the task to an employee of the department **or to themselves**. The manager can split one assignment into several tasks (e.g. one per requirement or per expected proof item). |
| BR-ASG-04 | The manager can **reassign** a task to the same or another employee of the same department, or take it personally. Every ownership change records who, when, from, to and why. |
| BR-ASG-05 | Every task keeps the **original assignee** permanently, separately from the **current owner**. |
| BR-ASG-06 | The consultant can edit instructions and deadlines of an assignment before work starts; afterwards deadline changes go through the extension process (BR-EXT) or a consultant correction with mandatory reason. |
| BR-ASG-07 | The consultant can cancel an assignment with a mandatory reason; its tasks become *cancelled*; evidence already uploaded stays in the bank. |

### BR-CLR · Clarification

| ID | Requirement |
|---|---|
| BR-CLR-01 | The current owner of a task (employee or manager) can raise a **clarification request** on the task, optionally pointing at a specific requirement or expected proof item. |
| BR-CLR-02 | The request goes **directly to the consultant**, not through the manager. |
| BR-CLR-03 | An answer is routed **back to the person who asked**. When an employee asks, the **department manager can see the request and answer it too**, so the employee is not left waiting (D4). The consultant is informed when the manager answers and can add to the answer. |
| BR-CLR-04 | The consultant has a configurable **response deadline**; overdue clarifications trigger reminders and escalation per [07](07-notifications-and-escalation.md). An answer from the manager also stops this deadline. |
| BR-CLR-05 | Answers can include text and attachments; a request can have follow-up messages until the requester closes it or the consultant marks it resolved. |
| BR-CLR-06 | While a clarification is open, the task's **implementation deadline is paused** (D1). When it is answered, the deadline resumes and moves later by the paused working time, rounded to the nearest whole working day. A follow-up question pauses it again. The original deadline is still shown. |

### BR-EXT · Extension requests

| ID | Requirement |
|---|---|
| BR-EXT-01 | Only the **department manager** can raise a formal extension request to the consultant, with the requested new date and a business justification. |
| BR-EXT-01a | An **employee** can ask their manager for more time inside the system (D7). The manager either turns it into a formal request (editing the date and reason if needed) or declines it with a note to the employee. |
| BR-EXT-02 | The consultant is notified and must decide within a configurable deadline. |
| BR-EXT-03 | **Approve** → the task's current deadline becomes the approved date (which may differ from the requested date). **Reject** → mandatory rejection reason; the deadline stays exactly as set by the consultant. |
| BR-EXT-04 | The original deadline is never overwritten; the system keeps original deadline, current deadline, and the full history of requests and decisions. |
| BR-EXT-05 | Only one extension request per task can be pending at a time. |

### BR-ESC · Escalation

| ID | Requirement |
|---|---|
| BR-ESC-01 | There are exactly two escalation types: **manual** (consultant, at any time, mandatory reason) and **automatic** (system, when a task deadline passes without resolution). |
| BR-ESC-02 | The automatic threshold is configurable (e.g. at the deadline, or N business days after it). It does not fire while the deadline is paused (open clarification, D1; evidence waiting for review, D5). |
| BR-ESC-03 | Both types: move current ownership to the **department manager**, notify the manager, keep the original employee assignment, and record type, reason, date, actor and previous owner. |
| BR-ESC-04 | After escalation the manager can solve the task personally or reassign it (BR-ASG-04). |
| BR-ESC-05 | If the manager already owns the task when it becomes due, the automatic escalation goes to **the manager himself** (D2): it is recorded and sent to him, and ownership does not change. The consultant sees it on his dashboard. |
| BR-ESC-06 | Escalations of consultant and submission-officer work (overdue review, clarification, extension decision, posting) follow the notification rules in [07](07-notifications-and-escalation.md); they notify configured recipients and never reassign the work automatically. |
| BR-ESC-07 | An escalation cannot be deleted. The task shows an "escalated" marker with its history. |

### BR-EVD · Evidence and artifacts

| ID | Requirement |
|---|---|
| BR-EVD-01 | Evidence is managed as **artifacts** in the cycle's evidence bank, independent of tasks. |
| BR-EVD-02 | Supported types: PDF, Word, Excel, PowerPoint, images/screenshots, exported data (CSV, etc.), archives, and URL/link evidence. Allowed extensions and size limits are configurable. |
| BR-EVD-03 | An artifact has an owner, a title, a type, a description, and one or more **versions**. Uploading a correction creates a new version; old versions are kept. |
| BR-EVD-04 | Each artifact version is **linked** to one or more requirements (and optionally to a specific expected proof item). One version may serve several requirements. |
| BR-EVD-05 | A requirement can have multiple artifacts. A standard can therefore have many artifacts across its requirements. |
| BR-EVD-06 | The executor uploads, links and then **submits** artifacts for review; uploading alone does not submit. |
| BR-EVD-06a | The **consultant can attach evidence to any task like a normal employee** (D3), for example central documents or reused evidence. Who reviews it: BR-REV-05. |
| BR-EVD-07 | Executors may record evidence metadata DGA cares about: document date, approving authority, page references to each requirement (for documents over 20 pages), and public link for published content. |
| BR-EVD-08 | Files are virus-scanned before they can be reviewed or downloaded. Infected files are quarantined and the uploader is notified. |
| BR-EVD-09 | Duplicate uploads (same content hash in the same cycle) are detected and the existing artifact is offered instead. |

### BR-REV · Review

| ID | Requirement |
|---|---|
| BR-REV-01 | The consultant reviews each **evidence link** (artifact version × requirement) separately: **accept** or **reject**, with a **mandatory comment** for rejection and an optional comment for acceptance. |
| BR-REV-02 | One artifact may be accepted for one requirement and rejected for another. |
| BR-REV-03 | The consultant has a configurable **review deadline** per submitted link. The same deadline covers the decision and, when rejecting, the feedback (D5). |
| BR-REV-04 | A rejection returns the task to the **department manager** with the reason. There is no separate rework deadline (D5): the task's implementation deadline, which was paused while the evidence waited for review, resumes. The manager reworks it personally or reassigns it; the reworked artifact is a new version, reviewed again. |
| BR-REV-05 | Nobody reviews evidence they uploaded. Evidence a consultant attached himself appears only in the **other consultants'** review queue (D9). The system warns the administrator when fewer than two consultants are active, because such evidence could not be reviewed. |
| BR-REV-06 | Accepted links become available to the DGA Submission Officer. |
| BR-REV-07 | Optional **review checklist** per expected proof item (e.g. "signed by competent authority", "dated in cycle", "table of contents present"), configurable per framework version. |
| BR-REV-08 | The consultant can **revoke** an earlier acceptance with a mandatory reason (e.g. evidence later found invalid). The link stops counting toward readiness immediately; if it was posted, the submission officer is alerted (BR-SUB-05). |
| BR-REV-09 | When a newer version is accepted for the same requirement, the older accepted link becomes *superseded* automatically. |

### BR-CMP · Completeness

| ID | Requirement |
|---|---|
| BR-CMP-01 | Uploading a document never completes a standard by itself. |
| BR-CMP-02 | An **expected proof item** is *covered* when at least one linked artifact version is **accepted** for it. |
| BR-CMP-03 | A **requirement** is *ready* when all its expected proof items are covered (or, if it has none, when at least one accepted link exists). Not-applicable requirements are excluded. |
| BR-CMP-04 | **Standard, axis, perspective and cycle readiness** = ready applicable requirements ÷ applicable requirements, shown as a percentage, rolled up through the hierarchy. |
| BR-CMP-05 | **Posting progress** is calculated separately: accepted links posted ÷ accepted links. |
| BR-CMP-06 | Completeness is recalculated on every review decision, applicability change and link change; dashboards never show stale figures without a timestamp. |

### BR-SUB · DGA submission preparation

| ID | Requirement |
|---|---|
| BR-SUB-01 | The DGA Submission Officer sees all accepted links, grouped by perspective → axis → standard → requirement. |
| BR-SUB-02 | The officer can prepare a **package** per standard (or any grouping): ordered list of accepted artifacts with their requirement mapping, downloadable as a single archive with an index. |
| BR-SUB-03 | The officer records submission status per link: **not posted** or **posted**, with date, actor and optional DGA reference/notes. Bulk marking per standard is supported. |
| BR-SUB-04 | The officer can revert *posted* to *not posted* with a mandatory reason (audited). |
| BR-SUB-05 | If an accepted link is later superseded or rejected again, its posted flag is kept for history and the dashboard flags the requirement as "posted evidence changed". |
| BR-SUB-06 | The system does not record DGA's assessment of posted evidence in Phase 1. |

### BR-BNK · Annual evidence banks

| ID | Requirement |
|---|---|
| BR-BNK-01 | Each cycle has its own **evidence bank**. Banks of closed cycles stay available read-only. |
| BR-BNK-02 | The consultant can search historical banks (by text, standard, requirement, type, owner, date). |
| BR-BNK-03 | The consultant can **reuse** a historical artifact version as a starting point in the current cycle. This creates a new artifact in the current bank that records its source; it starts as *draft* and needs normal submission and review. |
| BR-BNK-04 | Historical acceptance never carries over. Each cycle has independent assignments, deadlines, reviews and completeness. |
| BR-BNK-05 | Lineage is preserved: every reused artifact points to the exact source version and source cycle. Details: [06](06-evidence-bank.md). |

### BR-NTF · Notifications and deadlines

| ID | Requirement |
|---|---|
| BR-NTF-01 | Deadlines exist for every operational role: manager assignment action, implementation (employee or manager), consultant clarification response, consultant review including rejection feedback (D5), consultant extension decision, submission officer posting. |
| BR-NTF-02 | Each deadline type has a configurable duration (business days), reminder schedule, and escalation recipients. |
| BR-NTF-03 | Business days exclude configured weekends and public holidays. |
| BR-NTF-04 | Notifications are in-app and by email, in the recipient's language (Arabic, English or Urdu). |
| BR-NTF-05 | Full rule set: [07](07-notifications-and-escalation.md). |

### BR-DSH · Dashboards and reports

See [08](08-dashboards-and-reports.md). Every role sees a dashboard scoped to their responsibility; executives see the whole cycle: readiness, posted vs not posted, overdue work, and timeline per evidence.

### BR-ADM · Administration

| ID | Requirement |
|---|---|
| BR-ADM-01 | Authorized administrators manage **users** (create, edit, deactivate; never hard-delete). |
| BR-ADM-02 | Manage **departments** as a tree, each with exactly one active manager (and optional deputies). |
| BR-ADM-03 | Manage **groups**: named sets of users used for permissions and notification routing (e.g. *Compliance Oversight*). |
| BR-ADM-04 | Manage **roles and permissions**: the six default roles ship pre-configured; administrators can create custom roles from the permission catalogue, but cannot remove the separation-of-duty rules (for example, Consultant and Submission Officer can never be given to the same person, D3). |
| BR-ADM-05 | Assign roles to users, optionally **scoped** to a department. |
| BR-ADM-06 | Manage settings: organization profile and branding, working calendar, deadline policies, escalation thresholds, notification templates, file rules, language defaults. |
| BR-ADM-07 | All administration changes are audited. |

### BR-AUD · Audit

| ID | Requirement |
|---|---|
| BR-AUD-01 | Every state change, ownership change, decision, deadline change, applicability change, permission change and file access is written to an append-only audit log (actor, time, entity, before, after, IP). |
| BR-AUD-02 | No role can edit or delete audit records. |
| BR-AUD-03 | Each task, artifact and requirement shows its own timeline built from the audit log. |

## 5. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | **On-premises, single client per installation**: own database, file storage, users and configuration ([09](09-deployment.md)). |
| NFR-02 | **Languages**: Arabic (default, RTL), English, Urdu (RTL); switch without reload. |
| NFR-03 | **Configurable, not hardcoded**: framework, cycles, deadlines, roles, notification rules. |
| NFR-04 | **Security**: TLS, hashed passwords, account lockout, least privilege, signed time-limited file URLs, virus scanning, encrypted storage at rest. |
| NFR-05 | **Retention**: audit and evidence retained per client policy (default: audit 7 years, evidence 5 years after cycle close); cycles are archived, never deleted. |
| NFR-06 | **Performance**: common pages < 2 s at p95 with 500 concurrent users; uploads up to 50 MB per file (configurable). |
| NFR-07 | **Responsive**: usable on desktop, tablet and phone. |
| NFR-08 | **Accessibility**: keyboard operable, screen-reader labels in the active language. |

## 6. Traceability

Each requirement ID above will be referenced from user stories, test cases and code comments during implementation.
