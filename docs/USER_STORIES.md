# User Stories & Acceptance Criteria
# Qiyas — Digital Evidence & Compliance Management Platform

**Version:** 1.0
**Date:** 2026-03-09
**Author:** Senior Engineering Team

> **Related Documents:** [`PRD.md`](./PRD.md) · [`BUSINESS_RULES.md`](./BUSINESS_RULES.md) · [`DATA_MODEL.md`](./DATA_MODEL.md)

---

## Table of Contents

- [Epic 1: Authentication & Access](#epic-1-authentication--access)
- [Epic 2: User & Role Management](#epic-2-user--role-management)
- [Epic 3: Compliance Hierarchy Management](#epic-3-compliance-hierarchy-management)
- [Epic 4: Task Management](#epic-4-task-management)
- [Epic 5: Evidence Submission](#epic-5-evidence-submission)
- [Epic 6: Review Workflow](#epic-6-review-workflow)
- [Epic 7: Notifications](#epic-7-notifications)
- [Epic 8: Dashboard & Analytics](#epic-8-dashboard--analytics)
- [Epic 9: Reports](#epic-9-reports)
- [Epic 10: Audit Log](#epic-10-audit-log)
- [Epic 11: Localization](#epic-11-localization)
- [Epic 12: Organizational Structure](#epic-12-organizational-structure)
- [Acceptance Criteria](#acceptance-criteria)

---

> **Story Format:** As a **[persona]**, I want to **[action]**, so that **[benefit]**.
>
> **Priority:** P0 = Must have (launch blocker) · P1 = Should have · P2 = Nice to have
>
> **Linked Reqs:** References to Functional Requirements in `PRD.md §8`

---

## Epic 1: Authentication & Access

### US-001 — User Login
**As an** employee, **I want to** log into the system using my institutional email and password, **so that** I can access tasks and evidence relevant to my role.

- **Priority:** P0
- **Linked Reqs:** AUTH-01, AUTH-02, AUTH-03
- **See:** [AC-001](#ac-001--user-login)

---

### US-002 — Account Lockout Protection
**As a** system administrator, **I want** the system to lock accounts after 5 failed login attempts, **so that** brute-force attacks are prevented.

- **Priority:** P0
- **Linked Reqs:** AUTH-04, AUTH-05
- **See:** [AC-001](#ac-001--user-login)

---

### US-003 — Session Refresh
**As an** authenticated user, **I want** my session to automatically refresh without requiring me to log in again during active use, **so that** I am not interrupted mid-task.

- **Priority:** P0
- **Linked Reqs:** AUTH-02

---

### US-004 — Forced Logout
**As a** system administrator, **I want to** revoke a user's active sessions, **so that** I can immediately remove access for terminated or compromised accounts.

- **Priority:** P0
- **Linked Reqs:** AUTH-06

---

## Epic 2: User & Role Management

### US-005 — Create User Account
**As a** system administrator, **I want to** create new user accounts with name, email, role, and department, **so that** new staff can access the system immediately.

- **Priority:** P0
- **Linked Reqs:** USR-01, USR-04

---

### US-006 — Assign Roles to Users
**As a** system administrator, **I want to** assign one or more roles to each user, **so that** access is controlled based on job function.

- **Priority:** P0
- **Linked Reqs:** USR-02, USR-03

---

### US-007 — Deactivate User Account
**As a** system administrator, **I want to** deactivate user accounts without deleting them, **so that** historical data is preserved while access is revoked.

- **Priority:** P0
- **Linked Reqs:** USR-05

---

### US-008 — Manage Permissions per Role
**As a** system administrator, **I want to** configure granular permissions for each role (e.g., can_create_task, can_review_evidence), **so that** the system enforces least-privilege access.

- **Priority:** P0
- **Linked Reqs:** USR-03, USR-06

---

## Epic 3: Compliance Hierarchy Management

### US-009 — Browse Compliance Hierarchy
**As a** compliance manager, **I want to** browse the full Perspective → Axis → Standard → Evidence Requirement tree, **so that** I can understand the complete compliance scope.

- **Priority:** P0
- **Linked Reqs:** HIER-01, HIER-02

---

### US-010 — View Completion at Each Level
**As a** compliance manager, **I want to** see the completion percentage at each level of the hierarchy (Perspective, Axis, Standard), **so that** I can identify where gaps exist.

- **Priority:** P0
- **Linked Reqs:** HIER-03, HIER-07

---

### US-011 — Create Hierarchy Nodes
**As an** administrator, **I want to** create new Perspectives, Axes, Standards, and Evidence Requirements with Arabic and English names, **so that** the compliance framework is fully configured.

- **Priority:** P0
- **Linked Reqs:** HIER-05, HIER-02

---

### US-012 — Edit and Archive Hierarchy Nodes
**As an** administrator, **I want to** edit existing hierarchy nodes and archive obsolete ones, **so that** the compliance framework stays current without losing historical data.

- **Priority:** P1
- **Linked Reqs:** HIER-05, HIER-06

---

### US-013 — Automatic Completion Recalculation
**As a** compliance manager, **I want** completion percentages to update automatically when evidence is approved or rejected, **so that** the dashboard always reflects current status.

- **Priority:** P0
- **Linked Reqs:** HIER-03, HIER-04

---

## Epic 4: Task Management

### US-014 — Create and Assign Task
**As a** compliance manager, **I want to** create a task linked to an Evidence Requirement and assign it to a specific employee with a deadline, **so that** accountability and scope are clearly defined.

- **Priority:** P0
- **Linked Reqs:** TASK-01, TASK-02, TASK-04
- **See:** [AC-002](#ac-002--task-assignment)

---

### US-015 — View My Task Queue
**As an** evidence submitter, **I want to** see all tasks assigned to me with their status, deadline, and required evidence description, **so that** I know exactly what to do and by when.

- **Priority:** P0
- **Linked Reqs:** TASK-01, TASK-03

---

### US-016 — Update Task Status
**As an** evidence submitter, **I want to** mark my task as "In Progress" when I start working on it, **so that** my manager can track actual progress.

- **Priority:** P0
- **Linked Reqs:** TASK-03

---

### US-017 — Add Comments to Task
**As any** task participant (submitter, reviewer, manager), **I want to** add comments to a task thread, **so that** all communication about that task is centralized and traceable.

- **Priority:** P1
- **Linked Reqs:** TASK-06

---

### US-018 — Reassign Task
**As a** compliance manager, **I want to** reassign an open task to a different employee with a mandatory justification note, **so that** workload can be balanced and unavailable staff covered.

- **Priority:** P1
- **Linked Reqs:** TASK-07

---

### US-019 — Cancel Task
**As a** compliance manager, **I want to** cancel a task that is no longer required, **so that** it is removed from active queues without losing its history.

- **Priority:** P1
- **Linked Reqs:** TASK-08

---

### US-020 — View Overdue Tasks
**As a** compliance manager, **I want to** see a filtered list of all overdue tasks across my department, **so that** I can prioritize interventions before SLA breaches escalate.

- **Priority:** P0
- **Linked Reqs:** TASK-04, TASK-05

---

## Epic 5: Evidence Submission

### US-021 — Upload Evidence Files
**As an** evidence submitter, **I want to** upload one or more files (PDF, Word, images) to fulfill a task's evidence requirement, **so that** the reviewer has everything needed to evaluate compliance.

- **Priority:** P0
- **Linked Reqs:** EVID-01, EVID-02, EVID-05
- **See:** [AC-003](#ac-003--evidence-submission)

---

### US-022 — Add Submission Notes
**As an** evidence submitter, **I want to** add explanatory notes alongside my uploaded files, **so that** the reviewer has context for interpreting the evidence.

- **Priority:** P1
- **Linked Reqs:** EVID-05

---

### US-023 — Receive Virus Scan Result
**As an** evidence submitter, **I want to** be notified if my uploaded file failed virus scanning, **so that** I can upload a clean replacement immediately.

- **Priority:** P0
- **Linked Reqs:** EVID-03, EVID-04, EVID-08
- **See:** [AC-003](#ac-003--evidence-submission)

---

### US-024 — View Submission History
**As an** evidence submitter or reviewer, **I want to** see the full version history of all submissions for an evidence requirement, **so that** I can track the evolution of the evidence across revision cycles.

- **Priority:** P1
- **Linked Reqs:** EVID-06

---

### US-025 — Receive Submission Confirmation
**As an** evidence submitter, **I want to** receive an in-app and email notification confirming my submission was received, **so that** I have a record and reassurance the submission registered.

- **Priority:** P1
- **Linked Reqs:** EVID-08, NOTIF-01, NOTIF-02

---

## Epic 6: Review Workflow

### US-026 — View Review Queue
**As a** compliance reviewer, **I want to** see a prioritized queue of submitted evidence awaiting my review, **so that** I can work through reviews systematically without missing anything.

- **Priority:** P0
- **Linked Reqs:** REV-01

---

### US-027 — Download and Preview Evidence
**As a** compliance reviewer, **I want to** download and preview uploaded evidence files directly in the platform, **so that** I can evaluate content without switching tools.

- **Priority:** P0
- **Linked Reqs:** REV-02

---

### US-028 — Approve Evidence
**As a** compliance reviewer, **I want to** approve a submitted evidence package with a mandatory comment, **so that** the standard is marked as fulfilled and the completion metric updates.

- **Priority:** P0
- **Linked Reqs:** REV-03, REV-04, REV-05
- **See:** [AC-004](#ac-004--review-decision)

---

### US-029 — Reject Evidence
**As a** compliance reviewer, **I want to** reject a submitted evidence package with a clear explanation, **so that** the submitter knows exactly why it was rejected and what to correct.

- **Priority:** P0
- **Linked Reqs:** REV-03, REV-04, REV-06
- **See:** [AC-004](#ac-004--review-decision)

---

### US-030 — Request Resubmission
**As a** compliance reviewer, **I want to** request a resubmission with specific guidance (rather than a full rejection), **so that** the submitter can make targeted corrections without starting over.

- **Priority:** P0
- **Linked Reqs:** REV-03, REV-04, REV-06

---

### US-031 — View Decision History
**As a** compliance reviewer or manager, **I want to** view the complete review decision history for any evidence requirement, **so that** I can understand the full review cycle including previous rejections and comments.

- **Priority:** P1
- **Linked Reqs:** REV-07

---

### US-032 — Conflict of Interest Prevention
**As the** system, **I will** prevent reviewers from reviewing evidence they themselves submitted, **so that** independence of the review process is guaranteed.

- **Priority:** P0
- **Linked Reqs:** REV-08
- **See:** [AC-004](#ac-004--review-decision)

---

## Epic 7: Notifications

### US-033 — Task Assignment Notification
**As an** evidence submitter, **I want to** receive an in-app and email notification when a new task is assigned to me, **so that** I can begin working on it promptly.

- **Priority:** P1
- **Linked Reqs:** NOTIF-01, NOTIF-02

---

### US-034 — Review Decision Notification
**As an** evidence submitter, **I want to** receive a notification when my submission has been reviewed (approved, rejected, or returned for revision), **so that** I can take the appropriate next action.

- **Priority:** P1
- **Linked Reqs:** NOTIF-01, NOTIF-02

---

### US-035 — SLA Warning Notification
**As an** evidence submitter and their manager, **I want to** receive an early warning notification when a task is approaching its deadline (48 hours prior), **so that** action can be taken before SLA breach.

- **Priority:** P1
- **Linked Reqs:** NOTIF-01, NOTIF-02
- **See:** [AC-005](#ac-005--sla-escalation)

---

### US-036 — Escalation Notification
**As a** compliance manager, **I want to** receive an escalation notification when a task breaches its SLA, **so that** I can intervene immediately.

- **Priority:** P1
- **Linked Reqs:** NOTIF-01, NOTIF-02, TASK-05
- **See:** [AC-005](#ac-005--sla-escalation)

---

### US-037 — Manage Notification Preferences
**As any** user, **I want to** configure which notifications I receive by email vs. in-app only, **so that** I am not overwhelmed with low-priority alerts.

- **Priority:** P2
- **Linked Reqs:** NOTIF-03

---

## Epic 8: Dashboard & Analytics

### US-038 — View Overall Compliance Progress
**As a** compliance manager or executive, **I want to** see the overall compliance completion percentage prominently on the dashboard, **so that** I have an immediate status summary at a glance.

- **Priority:** P1
- **Linked Reqs:** DASH-01
- **See:** [AC-006](#ac-006--dashboard-refresh)

---

### US-039 — Drill Down by Perspective/Axis
**As a** compliance manager, **I want to** drill down from the overall percentage into individual Perspectives and Axes to see granular completion, **so that** I can identify the weakest areas.

- **Priority:** P1
- **Linked Reqs:** DASH-02

---

### US-040 — View Task KPI Cards
**As a** compliance manager, **I want to** see card-based KPIs for total tasks, open tasks, overdue tasks, and pending reviews, **so that** I can monitor operational health at a glance.

- **Priority:** P1
- **Linked Reqs:** DASH-03

---

### US-041 — Filter Dashboard by Department
**As a** compliance manager, **I want to** filter the dashboard by department, **so that** I can assess the compliance posture of a specific team.

- **Priority:** P2
- **Linked Reqs:** DASH-07

---

### US-042 — View Activity Feed
**As a** compliance manager, **I want to** see a real-time activity feed of recent submissions and decisions, **so that** I can quickly understand what has happened in the last 24 hours.

- **Priority:** P2
- **Linked Reqs:** DASH-05

---

## Epic 9: Reports

### US-043 — Generate Compliance Progress Report
**As a** compliance manager, **I want to** generate a compliance progress report filtered by date range and hierarchy node, **so that** I can share formal progress updates with leadership.

- **Priority:** P1
- **Linked Reqs:** RPT-01, RPT-04

---

### US-044 — Download Report in PDF or Excel
**As a** compliance manager, **I want to** download generated reports in PDF or Excel format, **so that** I can share them in standard formats with stakeholders who don't have system access.

- **Priority:** P1
- **Linked Reqs:** RPT-02

---

### US-045 — Receive Notification When Report is Ready
**As a** compliance manager, **I want to** receive a notification when my report has been generated, **so that** I don't need to wait on the screen.

- **Priority:** P1
- **Linked Reqs:** RPT-03, NOTIF-01

---

### US-046 — Generate Audit Trail Report
**As an** external auditor, **I want to** generate a full audit trail report for a given date range, **so that** I can verify that all decisions and state changes are properly documented.

- **Priority:** P1
- **Linked Reqs:** RPT-06, AUD-05

---

### US-047 — Generate Report in Arabic
**As a** compliance manager, **I want to** generate reports in Arabic, **so that** reports submitted to Arabic-language authorities are fully localized.

- **Priority:** P1
- **Linked Reqs:** RPT-07

---

## Epic 10: Audit Log

### US-048 — View Audit Log
**As a** system administrator or external auditor, **I want to** search and filter the audit log by user, entity, action type, and date range, **so that** I can trace any action taken in the system.

- **Priority:** P0
- **Linked Reqs:** AUD-04

---

### US-049 — Tamper-Proof Audit Records
**As an** external auditor, **I want** assurance that audit log entries cannot be edited or deleted, **so that** the record is a reliable evidence of system activity.

- **Priority:** P0
- **Linked Reqs:** AUD-03

---

### US-050 — Export Audit Log
**As an** external auditor, **I want to** export the audit log to CSV/Excel, **so that** I can analyze it with external tools.

- **Priority:** P1
- **Linked Reqs:** AUD-05

---

## Epic 11: Localization

### US-051 — Switch Interface Language
**As any** user, **I want to** toggle between Arabic and English at any time without losing my current context, **so that** I can work in my preferred language.

- **Priority:** P0
- **Linked Reqs:** USE-01, USE-02
- **See:** [AC-007](#ac-007--language-toggle)

---

### US-052 — View Content in Selected Language
**As any** user, **I want** all compliance hierarchy names, task descriptions, and UI labels to display in my selected language, **so that** there is no language mixing in the interface.

- **Priority:** P0
- **Linked Reqs:** HIER-02, USE-03

---

## Epic 12: Organizational Structure

### US-053 — Manage Departments
**As a** system administrator, **I want to** create, edit, and archive departments and organizational units, **so that** user-to-department mapping reflects the current org chart.

- **Priority:** P1
- **Linked Reqs:** USR-04

---

### US-054 — Assign Users to Departments
**As a** system administrator, **I want to** assign users to one or more departments, **so that** managers can filter tasks and reports by organizational unit.

- **Priority:** P1
- **Linked Reqs:** USR-04

---

---

## Acceptance Criteria

> **Format:** Given / When / Then

---

### AC-001 — User Login

**Given** a registered user with valid credentials
**When** they submit the login form
**Then:**
- A JWT access token is issued (expiry 15 min)
- A refresh token is set as httpOnly cookie (expiry 7 days)
- A CSRF token is set as a cookie
- The user is redirected to the dashboard
- A login event is written to the audit log

**Given** a user submitting invalid credentials
**When** they submit the login form
**Then:**
- An error message is shown: "Invalid email or password" (no hint about which field is wrong)
- Failed attempt count increments

**Given** a user whose account is locked
**When** they attempt to log in
**Then:**
- Login is rejected with message: "Account locked. Try again after 30 minutes or contact your administrator."

---

### AC-002 — Task Assignment

**Given** a compliance manager is on the task creation form
**When** they fill: title, evidence requirement (linked from hierarchy), assignee, and due date, then submit
**Then:**
- Task is created with status = `Assigned`
- Assignee receives in-app and email notification within 60 seconds
- Task appears in the assignee's task queue
- Audit log entry is created

**Given** a task due date is in the past
**When** the form is submitted
**Then:**
- Validation error: "Due date must be in the future"

---

### AC-003 — Evidence Submission

**Given** an assignee opens their task in `Assigned` or `Resubmission Required` status
**When** they upload one or more valid files and submit
**Then:**
- Task status transitions to `Submitted`
- Files are queued for virus scanning
- Submission confirmation notification is sent within 60 seconds
- Submission appears in reviewer's queue

**Given** a file exceeds 50 MB
**When** the user attempts to upload it
**Then:**
- Upload is rejected with message: "File exceeds maximum size of 50 MB"

**Given** a file fails virus scanning
**When** the scan completes
**Then:**
- File is quarantined (inaccessible for download)
- Submitter receives: "File [filename] was quarantined due to a security issue. Please upload a replacement."
- Task reverts to `In Progress` status

---

### AC-004 — Review Decision

**Given** a reviewer has opened a submission in `Submitted` status
**When** they select "Approved" and enter a comment, then confirm
**Then:**
- Task status transitions to `Approved`
- Evidence requirement completion status updates
- Standard completion percentage recalculates
- Cascade triggers update Axis and Perspective percentages
- Submitter receives approval notification

**Given** a reviewer selects "Rejected" without entering a comment
**When** they click submit
**Then:**
- Validation error: "A comment is required for rejection decisions"

**Given** a reviewer is the same user who submitted the evidence
**When** they open the submission
**Then:**
- Review action buttons are hidden/disabled
- Message displayed: "You cannot review evidence you submitted"

---

### AC-005 — SLA Escalation

**Given** a task has a configured SLA of 5 business days
**When** 48 business hours remain before the deadline and the task is not `Submitted` or `Approved`
**Then:**
- SLA warning notification is sent to the assignee and their manager

**When** the deadline passes without the task reaching `Submitted` status
**Then:**
- Task is flagged as `Overdue`
- Escalation notification is sent to the compliance manager
- Escalation event is logged in the audit trail

**When** the task remains `Overdue` for 3 additional business days
**Then:**
- Second-level escalation notification is sent to the department director

---

### AC-006 — Dashboard Refresh

**Given** the dashboard is loaded
**When** a review decision is made (approve/reject) within the same session
**Then:**
- Completion percentages on the dashboard update within 5 minutes (auto-refresh)
- The affected Perspective/Axis/Standard card reflects the new value
- A "data as of [timestamp]" indicator is shown if materialized view refresh fails

---

### AC-007 — Language Toggle

**Given** a user is viewing the interface in English
**When** they click the language toggle
**Then:**
- Interface immediately switches to Arabic
- Layout switches to RTL
- All labels, menu items, and hierarchy names display in Arabic
- No page reload occurs
- Language preference is persisted to the user's account

---

*Document End*

---

**Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-09 | Senior Engineering Team | Extracted from monolithic PRD.md v1.1; added SLA second-level escalation AC |
