# 02 · Role & Permission Matrix — Phase 1

[← Index](README.md)

## 1. Roles

| Code | Role | Type | Typical holder |
|---|---|---|---|
| `QC` | **Qiyas Consultant** | Operational | Compliance / transformation office |
| `DM` | **Department Manager** | Operational, **scoped to one department** | Head of a department |
| `EMP` | **Employee (Executor)** | Operational, scoped to their department | Department staff |
| `DSO` | **DGA Submission Officer** | Operational | Person accountable for DGA portal entry |
| `EXE` | Executive Viewer (D6) | Read-only | Top management |
| `ADM` | System Administrator (D8) | Administrative | Phase 1: the installation's operator. Can later be granted to client IT staff. |
| `EXA` | Executive Approver — **proposed (P1), awaiting approval** | Approval | Head of digital transformation, or the executive who signs off projects and procurement. Approves or rejects project charters and RFPs produced from Qiyas AI findings. |

- **Each role is held by several users** (e.g. Alaa and Ahmad are `QC`; Yousef and Jan are `DSO`). Queues are shared by all holders; one holder claims an item while acting on it, and can release it.
- A user may hold several roles; effective permissions are the union. **Exception: `QC` and `DSO` can never be held by the same person (D3).** *Proposed (P1): `QC` and `EXA` can never be held by the same person either.*
- `DM` and `EMP` are granted **per department**. A person can be an employee in one department and manager of another.
- Roles and permissions are data: administrators can create custom roles from the permission catalogue (BR-ADM-04). The six roles above ship as defaults.

## 2. Scopes

| Scope | Meaning |
|---|---|
| **Own** | Records where the user is the current owner, original assignee, requester or uploader |
| **Dept** | Records of the department(s) where the user holds the role |
| **All** | Every record in the active cycle (and historical cycles where stated) |

## 3. Permission matrix

✅ allowed · 🔸 allowed with the scope shown · — not allowed

### Framework and cycles

| Permission | QC | DM | EMP | DSO | EXE | ADM |
|---|---|---|---|---|---|---|
| `framework.view` — browse standards, requirements, proof items | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `framework.import` — import / revise a DGA version | ✅ | — | — | — | — | ✅ |
| `framework.crosswalk` — map old→new requirements | ✅ | — | — | — | — | — |
| `cycle.manage` — create, open, close, archive cycles | ✅ | — | — | — | — | ✅ |
| `applicability.manage` — mark requirement applicable / not applicable | ✅ | — | — | — | — | — |

### Assignments and tasks

| Permission | QC | DM | EMP | DSO | EXE | ADM |
|---|---|---|---|---|---|---|
| `assignment.create` — assign requirements to a department | ✅ | — | — | — | — | — |
| `assignment.edit` / `assignment.cancel` | ✅ | — | — | — | — | — |
| `task.view` | ✅ All | 🔸 Dept | 🔸 Own | ✅ All (read) | ✅ All (read) | — |
| `task.assign` — assign to an employee of the department | — | 🔸 Dept | — | — | — | — |
| `task.self_assign` — take the task personally | — | 🔸 Dept | — | — | — | — |
| `task.reassign` — move to same/other employee or self | — | 🔸 Dept | — | — | — | — |
| `task.split` — split an assignment into several tasks | — | 🔸 Dept | — | — | — | — |
| `task.work` — work, comment, upload on an owned task | — | 🔸 Own | 🔸 Own | — | — | — |
| `deadline.correct` — correct a deadline with reason | ✅ | — | — | — | — | — |

### Clarification, extension, escalation

| Permission | QC | DM | EMP | DSO | EXE | ADM |
|---|---|---|---|---|---|---|
| `clarification.request` | — | 🔸 Own tasks | 🔸 Own tasks | — | — | — |
| `clarification.answer` | ✅ | 🔸 Dept (D4) | — | — | — | — |
| `clarification.view` | ✅ All | 🔸 Dept (D4) | 🔸 Own | — | — | — |
| `extension.suggest` — ask the manager for more time (D7) | — | — | 🔸 Own tasks | — | — | — |
| `extension.request` — formal request to the consultant | — | 🔸 Dept | — | — | — | — |
| `extension.forward_or_decline` — act on an employee's ask | — | 🔸 Dept | — | — | — | — |
| `extension.decide` — approve / reject with reason | ✅ | — | — | — | — | — |
| `escalation.manual` | ✅ | — | — | — | — | — |
| `escalation.view` | ✅ All | 🔸 Dept | 🔸 Own | — | ✅ All | — |

### Evidence

| Permission | QC | DM | EMP | DSO | EXE | ADM |
|---|---|---|---|---|---|---|
| `evidence.upload` — create artifact / new version | ✅ All tasks (D3, note 1) | 🔸 Own tasks | 🔸 Own tasks | — | — | — |
| `evidence.link` — map version ↔ requirement | ✅ All tasks | 🔸 Own tasks | 🔸 Own tasks | — | — | — |
| `evidence.submit` — submit links for review | ✅ All tasks (note 1) | 🔸 Own tasks | 🔸 Own tasks | — | — | — |
| `evidence.withdraw` — withdraw a submitted link before decision | — | 🔸 Own tasks | 🔸 Own tasks | — | — | — |
| `evidence.view` / `evidence.download` | ✅ All | 🔸 Dept | 🔸 Own | 🔸 Accepted only | 🔸 Accepted only | — |
| `review.decide` — accept / reject a link | ✅ | — | — | — | — | — |

Note 1: the consultant can attach evidence to any task like a normal employee (D3), e.g. central documents or reuse from the bank, but **never reviews a link he uploaded** (SoD-1). Such links appear only in the other consultants' review queues (D9).

### Submission

| Permission | QC | DM | EMP | DSO | EXE | ADM |
|---|---|---|---|---|---|---|
| `submission.view_queue` — accepted links awaiting posting | ✅ (read) | — | — | ✅ | ✅ (read) | — |
| `submission.package` — build and download a package | — | — | — | ✅ | — | — |
| `submission.mark_posted` / `submission.mark_not_posted` | — | — | — | ✅ | — | — |

### Evidence banks

| Permission | QC | DM | EMP | DSO | EXE | ADM |
|---|---|---|---|---|---|---|
| `bank.view_current` | ✅ | 🔸 Dept | 🔸 Own | 🔸 Accepted | 🔸 Accepted | — |
| `bank.search_history` — search closed cycles | ✅ | — | — | ✅ (read) | — | — |
| `bank.reuse` — reuse a historical version in the current cycle | ✅ | — | — | — | — | — |
| `bank.import` — import an evidence folder into the current bank (files are suggestions; another consultant reviews them, D9) | ✅ | — | — | — | — | — |

### Regulations library

| Permission | QC | DM | EMP | DSO | EXE | ADM |
|---|---|---|---|---|---|---|
| `library.view` — laws, circulars, DGA controls and guides, with the standards citing them | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `library.manage` — upload the entity's copy of a document; add entity documents | ✅ | — | — | — | — | ✅ |

### Dashboards, reports, audit

| Permission | QC | DM | EMP | DSO | EXE | ADM |
|---|---|---|---|---|---|---|
| `dashboard.programme` — whole-cycle view | ✅ | — | — | ✅ | ✅ | — |
| `dashboard.department` | ✅ All | 🔸 Dept | — | — | ✅ All | — |
| `dashboard.personal` — my work | ✅ | ✅ | ✅ | ✅ | — | — |
| `report.generate` | ✅ | 🔸 Dept | — | ✅ | ✅ | — |
| `audit.view` | ✅ (cycle records) | 🔸 Dept | — | — | — | ✅ All |

### Administration

| Permission | QC | DM | EMP | DSO | EXE | ADM |
|---|---|---|---|---|---|---|
| `admin.users` | — | — | — | — | — | ✅ |
| `admin.departments` (tree, manager per department) | — | — | — | — | — | ✅ |
| `admin.groups` | — | — | — | — | — | ✅ |
| `admin.roles` (roles, permissions, scoped role grants) | — | — | — | — | — | ✅ |
| `admin.settings` — calendar, branding, file rules, languages | — | — | — | — | — | ✅ |
| `admin.sla_policies` — deadline durations, reminders, escalation thresholds | ✅ | — | — | — | — | ✅ |
| `admin.notification_templates` | — | — | — | — | — | ✅ |

The administrator has **no access to evidence content** by default (data minimization). A client may grant it explicitly.

### Qiyas AI — proposed (P1), awaiting approval

These permissions are sent by the platform gateway, in each request's short-lived scope token, to the Qiyas AI
engine (a separate service; the platform stays the system of record). They are implemented and tested in the
engine (`qiyas-ai-engine`, branch `feature/roles`); this section asks to adopt them here.

| Permission | QC | DM | EMP | DSO | EXE | ADM | EXA |
|---|---|---|---|---|---|---|---|
| `ai.coverage.read` — requirement coverage, gaps, corrective actions | ✅ | 🔸 Dept | 🔸 Own tasks | — | ✅ | — | ✅ |
| `ai.coverage.assess` — run a coverage check | ✅ | — | — | — | — | — | — |
| `ai.coverage.review` — confirm coverage and gaps, decide corrective action or project, accept proposed projects | ✅ | — | — | — | — | — | — |
| `ai.charters.read` / `ai.rfps.read` | ✅ | — | — | — | ✅ | — | ✅ |
| `ai.charters.prepare` / `ai.rfps.prepare` — create and edit charters, generate RFPs, manage RFP Word templates | ✅ | — | — | — | — | — | — |
| `ai.charters.approve` / `ai.rfps.approve` | — | — | — | — | — | — | ✅ |
| `ai.documents.read`, `ai.search` — evidence content and search | ✅ | 🔸 Dept | — | — | — | — | — |
| `ai.branding.manage` — entity name and logo in generated documents | — | — | — | — | — | ✅ | — |
| `ai.packages.install` — install IltizamTech-signed framework and template packages | — | — | — | — | — | ✅ | — |
| `ai.health.read` | — | — | — | — | — | ✅ | — |

- `EXA` sees results with evidence titles and citations, **not evidence files** (data minimisation, like `ADM`).
- `DSO` gets no AI permissions in this phase.
- For `DM` the gateway also sends `codes`: the standards assigned to the manager's departments in the active
  cycle; for `EMP`, the proof items of their own tasks. The engine limits results and search to those codes.
- The DGA framework catalogue and the expert project templates are approved by IltizamTech and arrive in signed
  packages; the entity installs them and cannot change them.

## 4. Separation-of-duty rules (cannot be switched off unless stated)

| ID | Rule |
|---|---|
| SoD-1 | Nobody may review an evidence link whose artifact version they uploaded. A consultant's own uploads are reviewed by another consultant (D9). The administrator is warned when fewer than two consultants are active. |
| SoD-2 | Nobody may decide an extension request they raised. |
| SoD-3 | A department manager may assign tasks only to members of their own department. |
| SoD-4 | Only accepted links can be marked posted. |
| SoD-5 | One user can never hold both `QC` and `DSO` (D3), so nobody posts evidence they reviewed. Enforced when roles are granted. |
| SoD-6 | An administrator cannot grant themselves operational roles without a second administrator's approval *(recommended; confirm)*. |
| SoD-7 | Nobody can edit or delete audit records. |
| SoD-8 | *Proposed (P1):* one user can never hold both `QC` and `EXA`. Enforced when roles are granted; the AI engine also refuses a scope token that carries both a prepare and an approve permission. |
| SoD-9 | *Proposed (P1):* nobody approves a project charter they created or edited, or an RFP version they generated (enforced by the AI engine). |
| SoD-10 | *Proposed (P1):* approve permissions are minted only for people, never for service accounts. |

## 5. Mapping from today's roles

| Current role in code | Becomes |
|---|---|
| `admin` | `ADM` (+ optionally `QC` if the same person runs the programme) |
| `consultant` | `QC` |
| `dean` | `EXE` or `DM`, depending on the person |
| `vice_dean` | `DM` or `EXE`, depending on the person |
| `employee` | `EMP` |
| — | `DSO` (new) |
