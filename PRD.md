# Product Requirements Document (PRD)
# Qiyas — Digital Evidence & Compliance Management Platform

**Version:** 1.0
**Date:** 2026-03-09
**Author:** Senior Engineering Team
**Status:** Approved for Development

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [Stakeholders](#4-stakeholders)
5. [User Personas](#5-user-personas)
6. [System Architecture Overview](#6-system-architecture-overview)
7. [Feature Modules](#7-feature-modules)
8. [Functional Requirements](#8-functional-requirements)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Business Rules](#10-business-rules)
11. [User Stories](#11-user-stories)
12. [Acceptance Criteria](#12-acceptance-criteria)
13. [Out of Scope](#13-out-of-scope)
14. [Assumptions & Constraints](#14-assumptions--constraints)
15. [Risks & Mitigations](#15-risks--mitigations)
16. [Glossary](#16-glossary)

---

## 1. Executive Summary

**Qiyas** is a government-grade digital platform for managing organizational compliance against national and international standards. It provides a structured four-level compliance hierarchy (Perspectives → Axes → Standards → Evidence Requirements), enabling organizations to track, submit, review, and audit compliance evidence through a governed workflow with role-based access, SLA enforcement, and real-time progress reporting.

The platform targets government bodies and public institutions required to demonstrate measurable compliance with regulatory frameworks. It replaces fragmented, manual, spreadsheet-driven compliance tracking with a centralized, auditable, bilingual (Arabic/English) digital system.

---

## 2. Problem Statement

Government organizations currently manage compliance evidence through:

- **Disconnected tools:** Email attachments, shared folders, and spreadsheets with no version control or audit trail.
- **No standardized workflow:** Submissions, reviews, and approvals happen through informal channels with no SLA enforcement.
- **Manual reporting:** Progress reports require manual aggregation across departments, leading to inaccurate and stale data.
- **No accountability:** No reliable record of who submitted what, when, or what decision was made and by whom.
- **Language barriers:** Systems are predominantly English-only, creating friction for Arabic-speaking staff.

These gaps result in missed deadlines, audit failures, regulatory penalties, and inability to demonstrate real-time compliance posture to senior leadership.

---

## 3. Goals & Success Metrics

### Primary Goals

| Goal | Description |
|------|-------------|
| **Centralized Compliance** | Single source of truth for all compliance evidence and review decisions |
| **Audit Readiness** | Immutable audit log covering every state change across all entities |
| **SLA Enforcement** | Automatic escalation when tasks breach configured SLA windows |
| **Real-Time Visibility** | Dashboard showing live compliance completion percentages at every hierarchy level |
| **Bilingual Operation** | Full Arabic and English support with RTL layout |

### Success Metrics (KPIs)

| Metric | Target |
|--------|--------|
| Evidence submission cycle time | ≤ 3 business days from assignment to approval |
| SLA breach rate | < 10% of all assigned tasks |
| Dashboard data freshness | ≤ 5 minutes lag from last submission |
| Audit trail completeness | 100% of state-changing actions logged |
| System uptime | ≥ 99.5% monthly |
| User adoption | ≥ 85% of target users active within 30 days of launch |
| Evidence approval rate on first submission | ≥ 70% |

---

## 4. Stakeholders

| Role | Name/Team | Interest |
|------|-----------|----------|
| **Executive Sponsor** | Ministry / Institution Leadership | Compliance posture, audit outcomes |
| **Product Owner** | Compliance Department Director | Feature prioritization, workflow design |
| **Compliance Managers** | Department Heads | Task assignment, SLA tracking |
| **Compliance Reviewers** | Quality/Audit Teams | Review workflow, decision accuracy |
| **Evidence Submitters** | Departmental Staff | Ease of submission, clear requirements |
| **IT / System Admins** | IT Department | System configuration, user management |
| **External Auditors** | Regulatory Bodies | Audit log access, report export |
| **Engineering Team** | Development Team | Technical feasibility, delivery |

---

## 5. User Personas

### Persona 1: Fatima — Evidence Submitter

- **Role:** Departmental Employee
- **Tech Literacy:** Moderate
- **Language:** Arabic (primary), English (secondary)
- **Goals:** Understand what evidence is required, upload files easily, track submission status
- **Frustrations:** Unclear requirements, no feedback on why submissions are rejected, multiple back-and-forth cycles
- **Key Needs:** Clear task descriptions, file upload simplicity, status notifications, Arabic UI

---

### Persona 2: Ahmed — Compliance Reviewer

- **Role:** Quality Assurance Specialist
- **Tech Literacy:** High
- **Language:** Arabic/English bilingual
- **Goals:** Review submissions efficiently, provide actionable feedback, maintain review quality
- **Frustrations:** No central queue, context lost between reviews, no way to track revision history
- **Key Needs:** Review queue dashboard, side-by-side evidence viewing, decision history per standard

---

### Persona 3: Dr. Khalid — Compliance Manager

- **Role:** Compliance Director / Department Head
- **Tech Literacy:** Moderate
- **Language:** Arabic (primary)
- **Goals:** Monitor team progress, assign tasks, escalate blockers, generate reports for leadership
- **Frustrations:** No real-time view of compliance progress, manual chasing of overdue tasks
- **Key Needs:** Dashboard KPIs, task assignment tools, SLA alerts, exportable progress reports

---

### Persona 4: Tariq — System Administrator

- **Role:** IT/System Admin
- **Tech Literacy:** Expert
- **Language:** Arabic/English
- **Goals:** Manage users, roles, permissions, system configuration; maintain system health
- **Frustrations:** No audit log visibility, no self-service user management
- **Key Needs:** User CRUD, role assignment, permission configuration, audit log search

---

### Persona 5: Layla — External Auditor (Read-Only)

- **Role:** External Regulatory Auditor
- **Tech Literacy:** Moderate
- **Language:** Arabic/English
- **Goals:** Verify compliance evidence, review approval history, export audit reports
- **Frustrations:** Cannot access granular decision history, reports lack detail
- **Key Needs:** Read-only access to evidence, audit trail export, PDF reports

---

## 6. System Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                  Client (React 19 + Vite)            │
│   Dashboard │ Tasks │ Evidence │ Reviews │ Reports   │
│             Full RTL + Arabic/English Support        │
└───────────────────────┬──────────────────────────────┘
                        │ HTTPS (port 443)
                        ▼
┌──────────────────────────────────────────────────────┐
│          Nginx / Caddy Reverse Proxy                 │
│    (static assets + /api → backend routing)         │
└───────────────────────┬──────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
┌──────────────────┐       ┌───────────────────────────┐
│  Backend API     │       │   Background Workers      │
│  Node.js/Express │       │   Bull Queue (Redis)      │
│  TypeScript      │       │   - Email Notifications   │
│  REST /api/v1    │       │   - SLA Monitor           │
└────────┬─────────┘       │   - Report Generation     │
         │                 └───────────────────────────┘
    ┌────┴──────────────────────────────┐
    │                                   │
    ▼                                   ▼
┌────────────────┐             ┌────────────────────┐
│  PostgreSQL 15 │             │  MinIO (S3 Storage)│
│  (Primary DB)  │             │  (Evidence Files)  │
└────────────────┘             └────────────────────┘
         │
    ┌────┘
    ▼
┌────────────────┐
│  Redis 7+      │
│  (Queue/Cache) │
└────────────────┘
```

### Compliance Hierarchy

```
Perspective  (e.g., "Governance & Leadership")
    └── Axis  (e.g., "Strategic Planning")
         └── Standard  (e.g., "STD-001: Vision & Mission Documentation")
              └── Evidence Requirement  (e.g., "Upload signed vision statement")
```

Completion percentages cascade upward: Evidence → Standard → Axis → Perspective → Overall.

---

## 7. Feature Modules

| Module | Description | Priority |
|--------|-------------|----------|
| **Authentication & Session Management** | JWT login, refresh tokens, CSRF protection, account lockout | P0 |
| **User & Role Management** | CRUD users, assign roles, manage permissions | P0 |
| **Compliance Hierarchy (P/A/S)** | Manage Perspectives, Axes, Standards and Evidence Requirements | P0 |
| **Task Management** | Assign tasks to users, track status, enforce SLA | P0 |
| **Evidence Submission** | File upload, metadata, version history, virus scan | P0 |
| **Review Workflow** | Approve/reject/request revision decisions with comments | P0 |
| **Notifications** | In-app and email alerts for assignments, reviews, escalations | P1 |
| **Dashboard & Analytics** | Real-time KPIs, completion charts, activity feed | P1 |
| **Reports** | Generate and export compliance reports (PDF/Excel) | P1 |
| **Audit Log** | Immutable record of all state changes | P0 |
| **Organizational Structure** | Department and unit management | P1 |
| **Escalation Management** | SLA breach detection and automatic escalation | P1 |
| **Language & Localization** | Arabic/English toggle, RTL layout | P0 |

---

## 8. Functional Requirements

### 8.1 Authentication & Session Management

| ID | Requirement |
|----|-------------|
| AUTH-01 | Users shall authenticate using email and password |
| AUTH-02 | The system shall issue a short-lived JWT access token (15 min) and a long-lived refresh token (7 days) via httpOnly cookie |
| AUTH-03 | CSRF tokens shall be required for all state-changing requests |
| AUTH-04 | Accounts shall be locked after 5 consecutive failed login attempts |
| AUTH-05 | Locked accounts shall auto-unlock after 30 minutes or via admin override |
| AUTH-06 | The system shall support forced logout via refresh token revocation |
| AUTH-07 | All authentication events (login, logout, lockout) shall be written to the audit log |

### 8.2 User & Role Management

| ID | Requirement |
|----|-------------|
| USR-01 | Admins shall be able to create, update, deactivate, and delete user accounts |
| USR-02 | Each user shall be assignable to one or more roles |
| USR-03 | Roles shall be configured with granular permissions (module:action pairs) |
| USR-04 | Users shall be associated with one or more organizational departments |
| USR-05 | Deactivated users shall retain their historical data but shall not be able to log in |
| USR-06 | The system shall support the following default roles: Admin, Compliance Manager, Compliance Reviewer, Evidence Submitter, External Auditor (Read-Only) |
| USR-07 | Role and permission changes shall be written to the audit log |

### 8.3 Compliance Hierarchy

| ID | Requirement |
|----|-------------|
| HIER-01 | The system shall support a four-level hierarchy: Perspective → Axis → Standard → Evidence Requirement |
| HIER-02 | All hierarchy nodes shall support bilingual names (Arabic and English) |
| HIER-03 | Completion percentage shall be calculated bottom-up from approved evidence |
| HIER-04 | Completion percentages shall update automatically upon review decisions |
| HIER-05 | Admins and Compliance Managers shall be able to create, edit, and archive hierarchy nodes |
| HIER-06 | Archiving a parent node shall cascade to all children |
| HIER-07 | The system shall display each node's completion percentage in both list and tree views |

### 8.4 Task Management

| ID | Requirement |
|----|-------------|
| TASK-01 | Compliance Managers shall be able to create and assign tasks to users |
| TASK-02 | Each task shall be linked to one or more Evidence Requirements within the hierarchy |
| TASK-03 | Tasks shall follow a defined status workflow: Draft → Assigned → In Progress → Submitted → Under Review → Approved / Rejected / Resubmission Required → Closed |
| TASK-04 | SLA deadlines shall be configurable per task type and enforced automatically |
| TASK-05 | Overdue tasks shall trigger an escalation event and notification |
| TASK-06 | Assignees shall be able to add comments to tasks throughout the workflow |
| TASK-07 | Managers shall be able to reassign tasks and update deadlines with justification |
| TASK-08 | Cancelled tasks shall be soft-deleted and visible in task history |

### 8.5 Evidence Submission

| ID | Requirement |
|----|-------------|
| EVID-01 | Evidence Submitters shall upload one or more files per task |
| EVID-02 | Supported file types: PDF, DOCX, XLSX, PNG, JPG, MP4, ZIP (max 50 MB per file) |
| EVID-03 | Uploaded files shall be scanned for viruses before being made available for review |
| EVID-04 | Quarantined files shall be blocked and the submitter notified immediately |
| EVID-05 | Each submission shall capture: submitter ID, timestamp, file metadata, linked task, and notes |
| EVID-06 | The system shall maintain a full version history for each evidence requirement |
| EVID-07 | Files shall be stored in object storage (MinIO/S3) with signed URLs for secure access |
| EVID-08 | Submitters shall receive a confirmation notification upon successful submission |

### 8.6 Review Workflow

| ID | Requirement |
|----|-------------|
| REV-01 | Compliance Reviewers shall be able to access a queue of submitted evidence awaiting review |
| REV-02 | Reviewers shall be able to download and preview submitted evidence files |
| REV-03 | Reviewers shall record one of three decisions: Approved, Rejected, or Resubmission Required |
| REV-04 | All decisions shall require a mandatory comment/justification |
| REV-05 | Approved evidence shall trigger automatic completion recalculation up the hierarchy |
| REV-06 | Rejected or resubmission-required tasks shall revert to the submitter with reviewer comments |
| REV-07 | A complete decision history shall be viewable per evidence requirement |
| REV-08 | Reviewers shall not be able to review evidence they themselves submitted |

### 8.7 Notifications

| ID | Requirement |
|----|-------------|
| NOTIF-01 | Users shall receive in-app notifications for: task assignment, status changes, review decisions, SLA warnings, and escalations |
| NOTIF-02 | Users shall receive email notifications for the same events |
| NOTIF-03 | Notification preferences shall be configurable per user per event type |
| NOTIF-04 | Unread notification count shall be displayed in the header |
| NOTIF-05 | Notifications shall be delivered within 60 seconds of the triggering event |
| NOTIF-06 | Failed email deliveries shall be retried up to 3 times with exponential backoff |

### 8.8 Dashboard & Analytics

| ID | Requirement |
|----|-------------|
| DASH-01 | The dashboard shall display overall compliance completion percentage |
| DASH-02 | The dashboard shall display breakdown by Perspective, Axis, and Standard |
| DASH-03 | The dashboard shall display: total tasks, open tasks, overdue tasks, pending reviews, and approved evidence counts |
| DASH-04 | The dashboard shall refresh automatically every 5 minutes |
| DASH-05 | Compliance Managers shall see a team activity feed showing recent submissions and decisions |
| DASH-06 | Data visualizations shall include progress bars, pie charts, and trend lines |
| DASH-07 | Dashboard data shall be filterable by department, date range, and hierarchy node |

### 8.9 Reports

| ID | Requirement |
|----|-------------|
| RPT-01 | Users shall be able to generate compliance progress reports |
| RPT-02 | Reports shall be available in PDF and Excel formats |
| RPT-03 | Report generation shall be asynchronous; users shall be notified when ready |
| RPT-04 | Reports shall be filterable by: date range, perspective, axis, department, and status |
| RPT-05 | Generated reports shall be downloadable for 30 days |
| RPT-06 | Audit reports shall include a full event log with user, timestamp, before/after values |
| RPT-07 | Reports shall support bilingual output (Arabic or English) selected at generation time |

### 8.10 Audit Log

| ID | Requirement |
|----|-------------|
| AUD-01 | Every state-changing operation shall write an immutable audit log entry |
| AUD-02 | Audit entries shall capture: user ID, action type, entity type, entity ID, before value (JSONB), after value (JSONB), IP address, timestamp |
| AUD-03 | Audit logs shall not be editable or deletable by any user role |
| AUD-04 | Admins shall be able to search and filter audit logs |
| AUD-05 | Audit logs shall be exportable for external auditor use |
| AUD-06 | Audit log retention period shall be configurable (default: 7 years) |

---

## 9. Non-Functional Requirements

### 9.1 Performance

| ID | Requirement |
|----|-------------|
| PERF-01 | API responses for common read operations shall complete within 500ms at p95 under normal load |
| PERF-02 | File upload endpoints shall support files up to 50 MB with chunked upload support |
| PERF-03 | Dashboard KPI queries shall complete within 2 seconds using materialized view snapshots |
| PERF-04 | The system shall support 500 concurrent users without degradation |
| PERF-05 | Background job queue (email, SLA monitor, reports) shall process jobs within 60 seconds of enqueue |

### 9.2 Security

| ID | Requirement |
|----|-------------|
| SEC-01 | All data in transit shall be encrypted using TLS 1.2 or higher |
| SEC-02 | Passwords shall be hashed using bcrypt with a minimum cost factor of 12 |
| SEC-03 | Access tokens shall not be stored in localStorage (use httpOnly cookies or sessionStorage) |
| SEC-04 | All API endpoints shall validate CSRF tokens for state-changing requests |
| SEC-05 | Input validation shall be enforced server-side using Zod schema validation |
| SEC-06 | Rate limiting shall be applied to authentication endpoints (10 req/min per IP) |
| SEC-07 | SQL injection shall be prevented through parameterized queries only |
| SEC-08 | File uploads shall be virus-scanned before storage or access |
| SEC-09 | Signed, time-limited URLs shall be used for all file access (15-minute expiry) |
| SEC-10 | The system shall implement principle of least privilege for all role permissions |

### 9.3 Availability & Reliability

| ID | Requirement |
|----|-------------|
| REL-01 | System uptime shall be ≥ 99.5% measured monthly |
| REL-02 | The system shall gracefully handle database connection failures with retry logic |
| REL-03 | Failed background jobs shall be retried with exponential backoff (max 3 attempts) |
| REL-04 | The system shall maintain operation during MinIO/Redis temporary failures with degraded functionality |
| REL-05 | Database backups shall be performed daily with a 30-day retention window |

### 9.4 Usability

| ID | Requirement |
|----|-------------|
| USE-01 | The interface shall support full RTL layout for Arabic and LTR for English |
| USE-02 | Language switching shall take effect without requiring a page reload |
| USE-03 | All form validations shall display error messages in the active language |
| USE-04 | The interface shall be responsive and usable on 1024px+ screen widths |
| USE-05 | Key workflows (submit evidence, complete review) shall be completable in ≤ 4 clicks from the dashboard |

### 9.5 Maintainability

| ID | Requirement |
|----|-------------|
| MAINT-01 | Backend code shall maintain ≥ 80% test coverage on business logic modules |
| MAINT-02 | All API contracts shall be documented using OpenAPI 3.0 specification |
| MAINT-03 | Database migrations shall be version-controlled and reversible |
| MAINT-04 | Application logs shall use structured JSON format with severity levels |
| MAINT-05 | All environment configuration shall be via environment variables (no hardcoded secrets) |

### 9.6 Compliance & Data

| ID | Requirement |
|----|-------------|
| COMP-01 | The system shall comply with applicable government data classification requirements |
| COMP-02 | Personal data handling shall comply with relevant privacy regulations |
| COMP-03 | Audit logs shall be retained for a minimum of 7 years |
| COMP-04 | Evidence files shall be retained for a minimum of 5 years after task closure |

---

## 10. Business Rules

Business rules define the invariant logic that governs how the system behaves regardless of who the actor is. These rules are non-negotiable and must be enforced at the application layer (and where applicable, at the database layer) to ensure data integrity, security, and compliance.

---

### BR-AUTH — Authentication & Session

| ID | Rule |
|----|------|
| BR-AUTH-01 | A user may not log in with a deactivated account. Deactivation takes effect immediately; any active sessions are invalidated. |
| BR-AUTH-02 | After 5 consecutive failed login attempts from the same account, the account is locked for 30 minutes. The counter resets on successful login. |
| BR-AUTH-03 | Access tokens expire after 15 minutes. Refresh tokens expire after 7 days. A new refresh token is issued on every token refresh (rotation). |
| BR-AUTH-04 | A revoked refresh token may not be reused. Attempted reuse is treated as a token replay attack and all sessions for that user are invalidated. |
| BR-AUTH-05 | All state-changing API requests must include a valid CSRF token. Requests without a matching CSRF token are rejected with HTTP 403. |
| BR-AUTH-06 | A user may have at most 5 concurrent active sessions (device sessions). The oldest session is invalidated when the limit is exceeded. |

---

### BR-USR — User & Role Management

| ID | Rule |
|----|------|
| BR-USR-01 | Every user must have at least one assigned role. A user cannot be saved without a role. |
| BR-USR-02 | A user may hold multiple roles simultaneously. Their effective permissions are the union of all assigned roles' permissions. |
| BR-USR-03 | Roles may not be deleted if they are currently assigned to one or more active users. They must be unassigned first. |
| BR-USR-04 | Only users with the `admin` role may create, modify, or deactivate user accounts. |
| BR-USR-05 | A user cannot deactivate their own account. |
| BR-USR-06 | Deactivating a user does not delete their submissions, tasks, or audit records. All historical data is preserved. |
| BR-USR-07 | Email addresses are unique system-wide. Two users cannot share the same email. |
| BR-USR-08 | Role and permission changes take effect on the user's next API request (within one token refresh cycle). |

---

### BR-HIER — Compliance Hierarchy

| ID | Rule |
|----|------|
| BR-HIER-01 | Every Standard must belong to exactly one Axis. Every Axis must belong to exactly one Perspective. Orphaned nodes are not permitted. |
| BR-HIER-02 | An Axis cannot be created without a parent Perspective. A Standard cannot be created without a parent Axis. An Evidence Requirement cannot be created without a parent Standard. |
| BR-HIER-03 | Archiving a Perspective cascades: all child Axes, Standards, and Evidence Requirements are archived simultaneously. |
| BR-HIER-04 | Archived hierarchy nodes are not visible to standard users. They remain visible only to admins in archive view. |
| BR-HIER-05 | A hierarchy node with open (non-closed) tasks may not be archived until all tasks are closed or cancelled. |
| BR-HIER-06 | Completion percentage at any level is calculated as: `(approved evidence requirements / total active evidence requirements) × 100`, rounded to one decimal place. |
| BR-HIER-07 | A Standard's completion status maps as follows: 0% = `not_started`, 1–99% = `in_progress`, 100% = `completed`. |
| BR-HIER-08 | Completion percentages recalculate automatically and synchronously upon any review decision (approve/reject). A stale percentage is never acceptable in displayed UI. |

---

### BR-TASK — Task Management

| ID | Rule |
|----|------|
| BR-TASK-01 | A task must be linked to at least one Evidence Requirement at creation time. |
| BR-TASK-02 | A task's due date must be a future date at the time of creation. |
| BR-TASK-03 | The task status machine is strictly enforced. Permitted transitions are: |

```
Draft ──► Assigned ──► In Progress ──► Submitted ──► Under Review ──► Approved
                                           │                          │
                                           └──────────────────────────► Rejected
                                                                       │
                                                                       └──► Resubmission Required
                                                                                  │
                                                                                  └──► In Progress (re-open)

Any state ──► Cancelled  (manager only, with mandatory reason)
Approved / Rejected / Cancelled ──► Closed  (terminal state)
```

| ID | Rule |
|----|------|
| BR-TASK-04 | Only the assigned user may transition a task from `Assigned` → `In Progress`. |
| BR-TASK-05 | Only a Compliance Manager or Admin may reassign a task. Reassignment requires a mandatory justification note logged to the audit trail. |
| BR-TASK-06 | A task in `Approved`, `Rejected`, or `Closed` status cannot be reopened except by an Admin. |
| BR-TASK-07 | Cancelling a task requires a mandatory cancellation reason. Cancelled tasks are soft-deleted and removed from active queues. |
| BR-TASK-08 | A task due date cannot be set to a past date, even when editing by a manager. |
| BR-TASK-09 | SLA clock starts when the task status first transitions to `Assigned`. SLA clock pauses while status is `Under Review`. |
| BR-TASK-10 | A task is marked `Overdue` the moment its due date passes and it has not reached `Submitted`, `Approved`, or `Closed` status. |

---

### BR-EVID — Evidence Submission

| ID | Rule |
|----|------|
| BR-EVID-01 | Evidence can only be submitted when the linked task is in `Assigned`, `In Progress`, or `Resubmission Required` status. Submission is blocked in all other states. |
| BR-EVID-02 | A submission must include at least one file. Notes-only submissions without files are not permitted. |
| BR-EVID-03 | Permitted file types: PDF, DOCX, XLSX, PPTX, PNG, JPG, JPEG, MP4, ZIP. All other file types are rejected at upload. |
| BR-EVID-04 | Maximum file size per upload: 50 MB. Maximum total submission size: 200 MB. |
| BR-EVID-05 | Every uploaded file must pass virus scanning before it is accessible for review. Files with a `pending` scan status cannot be downloaded. |
| BR-EVID-06 | A quarantined file is permanently inaccessible. The submitter must upload a replacement. A quarantined file is never deleted from storage (retained for forensic purposes). |
| BR-EVID-07 | Every submission creates a new version record. Previous submissions are retained and viewable in the version history. No submission is overwritten. |
| BR-EVID-08 | A submitter cannot delete a submitted file once the task status has advanced to `Submitted` or later. |
| BR-EVID-09 | File names are sanitized on upload (special characters and path traversal sequences stripped). Original file names are stored as metadata. |

---

### BR-REV — Review Workflow

| ID | Rule |
|----|------|
| BR-REV-01 | A reviewer cannot review evidence they submitted. This applies even if the reviewer was later assigned to the review role. System enforces this regardless of role. |
| BR-REV-02 | A review decision (Approve, Reject, Resubmission Required) requires a mandatory comment of at least 10 characters. Empty or whitespace-only comments are rejected. |
| BR-REV-03 | Only one review decision can be active per submission. A new decision supersedes the previous; both are retained in history. |
| BR-REV-04 | An `Approved` decision on a task cannot be reversed directly. To reverse, a manager must reopen the task (admin-only action), which voids the approval and resets the evidence requirement's completion contribution. |
| BR-REV-05 | A reviewer may not approve a submission that contains any file with a non-`clean` virus scan status. The approve button is disabled until all files pass scanning. |
| BR-REV-06 | After a `Resubmission Required` decision, the task status returns to `In Progress`. The submitter is notified with the reviewer's comments. A new submission creates a new version. |
| BR-REV-07 | After a `Rejected` decision, the task moves to `Rejected` status. A new task must be created by the manager to retry; the rejected task is not reopened. |
| BR-REV-08 | The review queue shows only submissions where the reviewer has been assigned or has the `can_review_evidence` permission for the relevant hierarchy node or department. |

---

### BR-SLA — SLA & Escalation

| ID | Rule |
|----|------|
| BR-SLA-01 | SLA duration is configured per task type and measured in business days (excluding weekends and public holidays configured in system settings). |
| BR-SLA-02 | An SLA warning notification is triggered automatically when a task has 48 business hours remaining before its due date and is not yet `Submitted` or `Approved`. |
| BR-SLA-03 | An escalation event is triggered the moment a task becomes `Overdue`. Escalation notifications are sent to the task assignee, their direct manager, and the Compliance Manager. |
| BR-SLA-04 | Escalation events are logged immutably to the audit trail. They cannot be dismissed or suppressed by any user. |
| BR-SLA-05 | A second-level escalation is triggered if the task remains `Overdue` for more than 3 additional business days after the first escalation. The second-level escalation notifies the department director. |
| BR-SLA-06 | SLA is considered met if the task reaches `Submitted` status before the due date, even if the review decision comes later. |
| BR-SLA-07 | Changing a task's due date after SLA breach does not clear the overdue flag retroactively. The breach event remains in the audit log. |

---

### BR-NOTIF — Notifications

| ID | Rule |
|----|------|
| BR-NOTIF-01 | The following events always generate notifications and cannot be disabled by the user: task assignment, SLA escalation (both levels), account lockout. |
| BR-NOTIF-02 | The following events generate notifications by default but can be disabled per user: submission confirmation, review decision, SLA warning, report ready. |
| BR-NOTIF-03 | In-app notifications are delivered in real time (within 60 seconds). Email notifications are delivered asynchronously via the job queue (target: within 60 seconds, max retry: 3 times with exponential backoff). |
| BR-NOTIF-04 | A failed email delivery after 3 retries creates a dead-letter queue entry and an admin alert. The in-app notification is unaffected. |
| BR-NOTIF-05 | Notification content is rendered in the recipient's configured language preference (Arabic or English). |
| BR-NOTIF-06 | Bulk notifications (e.g., when 10+ tasks breach SLA simultaneously) are batched into a single digest notification per recipient to prevent inbox flooding. |

---

### BR-DASH — Dashboard & Reporting

| ID | Rule |
|----|------|
| BR-DASH-01 | Dashboard KPI data is served from a materialized view snapshot. The snapshot is refreshed every 5 minutes via a scheduled job. |
| BR-DASH-02 | If the materialized view refresh fails, the dashboard displays the last successful snapshot with a visible "data as of [timestamp]" indicator. It does not display an error page. |
| BR-DASH-03 | Report generation jobs are queued asynchronously. A user may not have more than 3 pending report jobs simultaneously. |
| BR-DASH-04 | Generated report files are retained for 30 days from generation date, then automatically purged from object storage. |
| BR-DASH-05 | Reports are private to the user who requested them. Other users (including admins) cannot download another user's report unless they regenerate it themselves. |
| BR-DASH-06 | Completion percentages displayed in reports reflect the state at report generation time, not the current live state. The report timestamp is always shown. |

---

### BR-AUD — Audit & Data Integrity

| ID | Rule |
|----|------|
| BR-AUD-01 | Every create, update, delete, and status-change operation on any entity writes an audit log entry. Read-only operations are not logged (except login/logout). |
| BR-AUD-02 | Audit log entries are immutable. No user role — including Admin — can edit or delete an audit entry. This is enforced at the database level (no DELETE/UPDATE permissions on the audit_logs table). |
| BR-AUD-03 | Audit entries capture: `user_id`, `action`, `entity_type`, `entity_id`, `before_value` (JSONB), `after_value` (JSONB), `ip_address`, `user_agent`, `created_at`. All fields are mandatory. |
| BR-AUD-04 | Soft deletes are used for all user-facing entities. Hard deletes are prohibited except for: temporary files pre-virus-scan, expired report files, and expired refresh tokens. |
| BR-AUD-05 | Audit log retention: minimum 7 years. Evidence files: minimum 5 years after task closure. These periods cannot be reduced by admin configuration. |
| BR-AUD-06 | All database mutations are wrapped in transactions. A partial write that fails mid-transaction is rolled back entirely; the audit log entry for that operation is also rolled back. |

---

### BR-FILE — File Management

| ID | Rule |
|----|------|
| BR-FILE-01 | All file access is via signed, time-limited URLs (15-minute expiry). Direct storage URLs are never exposed to the client. |
| BR-FILE-02 | File storage paths are randomized (UUID-based) and do not reflect the original file name, preventing enumeration. |
| BR-FILE-03 | Duplicate file detection: if the same SHA-256 hash is uploaded to the same evidence requirement by the same user within 10 minutes, the second upload is rejected with message "This file has already been uploaded." |
| BR-FILE-04 | Uploading a file does not automatically submit the task. The submitter must explicitly click "Submit" to trigger the status transition. |
| BR-FILE-05 | Files are stored with server-side encryption (SSE) enabled in MinIO. |

---

### BR-LANG — Language & Localization

| ID | Rule |
|----|------|
| BR-LANG-01 | All hierarchy nodes (Perspective, Axis, Standard, Evidence Requirement) must have both an Arabic name and an English name. Neither field may be left blank. |
| BR-LANG-02 | System UI renders entirely in the active language. There must be no mixing of Arabic and English strings in the same UI session (except proper nouns and brand names). |
| BR-LANG-03 | Dates and numbers are formatted according to the active locale: Gregorian calendar for both languages; Arabic-Indic numerals when Arabic is active (configurable). |
| BR-LANG-04 | Language preference is stored per user account and persists across sessions. |
| BR-LANG-05 | All validation error messages, notification content, and report output must be available in both languages. |

---

## 11. User Stories

> **Format:** As a **[persona]**, I want to **[action]**, so that **[benefit]**.
> Each story includes a unique ID, priority (P0/P1/P2), and linked requirements.

---

### Epic 1: Authentication & Access

#### US-001 — User Login
**As an** employee, **I want to** log into the system using my institutional email and password, **so that** I can access tasks and evidence relevant to my role.

- **Priority:** P0
- **Linked Reqs:** AUTH-01, AUTH-02, AUTH-03
- **Acceptance Criteria:** See [AC-001](#ac-001--user-login)

---

#### US-002 — Account Lockout Protection
**As a** system administrator, **I want** the system to lock accounts after 5 failed login attempts, **so that** brute-force attacks are prevented.

- **Priority:** P0
- **Linked Reqs:** AUTH-04, AUTH-05

---

#### US-003 — Session Refresh
**As an** authenticated user, **I want** my session to automatically refresh without requiring me to log in again during active use, **so that** I am not interrupted mid-task.

- **Priority:** P0
- **Linked Reqs:** AUTH-02

---

#### US-004 — Forced Logout
**As a** system administrator, **I want to** revoke a user's active sessions, **so that** I can immediately remove access for terminated or compromised accounts.

- **Priority:** P0
- **Linked Reqs:** AUTH-06

---

### Epic 2: User & Role Management

#### US-005 — Create User Account
**As a** system administrator, **I want to** create new user accounts with name, email, role, and department, **so that** new staff can access the system immediately.

- **Priority:** P0
- **Linked Reqs:** USR-01, USR-04

---

#### US-006 — Assign Roles to Users
**As a** system administrator, **I want to** assign one or more roles to each user, **so that** access is controlled based on job function.

- **Priority:** P0
- **Linked Reqs:** USR-02, USR-03

---

#### US-007 — Deactivate User Account
**As a** system administrator, **I want to** deactivate user accounts without deleting them, **so that** historical data is preserved while access is revoked.

- **Priority:** P0
- **Linked Reqs:** USR-05

---

#### US-008 — Manage Permissions per Role
**As a** system administrator, **I want to** configure granular permissions for each role (e.g., can_create_task, can_review_evidence), **so that** the system enforces least-privilege access.

- **Priority:** P0
- **Linked Reqs:** USR-03, USR-06

---

### Epic 3: Compliance Hierarchy Management

#### US-009 — Browse Compliance Hierarchy
**As a** compliance manager, **I want to** browse the full Perspective → Axis → Standard → Evidence Requirement tree, **so that** I can understand the complete compliance scope.

- **Priority:** P0
- **Linked Reqs:** HIER-01, HIER-02

---

#### US-010 — View Completion at Each Level
**As a** compliance manager, **I want to** see the completion percentage at each level of the hierarchy (Perspective, Axis, Standard), **so that** I can identify where gaps exist.

- **Priority:** P0
- **Linked Reqs:** HIER-03, HIER-07

---

#### US-011 — Create Hierarchy Nodes
**As an** administrator, **I want to** create new Perspectives, Axes, Standards, and Evidence Requirements with Arabic and English names, **so that** the compliance framework is fully configured.

- **Priority:** P0
- **Linked Reqs:** HIER-05, HIER-02

---

#### US-012 — Edit and Archive Hierarchy Nodes
**As an** administrator, **I want to** edit existing hierarchy nodes and archive obsolete ones, **so that** the compliance framework stays current without losing historical data.

- **Priority:** P1
- **Linked Reqs:** HIER-05, HIER-06

---

#### US-013 — Automatic Completion Recalculation
**As a** compliance manager, **I want** completion percentages to update automatically when evidence is approved or rejected, **so that** the dashboard always reflects current status.

- **Priority:** P0
- **Linked Reqs:** HIER-03, HIER-04

---

### Epic 4: Task Management

#### US-014 — Create and Assign Task
**As a** compliance manager, **I want to** create a task linked to an Evidence Requirement and assign it to a specific employee with a deadline, **so that** accountability and scope are clearly defined.

- **Priority:** P0
- **Linked Reqs:** TASK-01, TASK-02, TASK-04

---

#### US-015 — View My Task Queue
**As an** evidence submitter, **I want to** see all tasks assigned to me with their status, deadline, and required evidence description, **so that** I know exactly what to do and by when.

- **Priority:** P0
- **Linked Reqs:** TASK-01, TASK-03

---

#### US-016 — Update Task Status
**As an** evidence submitter, **I want to** mark my task as "In Progress" when I start working on it, **so that** my manager can track actual progress.

- **Priority:** P0
- **Linked Reqs:** TASK-03

---

#### US-017 — Add Comments to Task
**As any** task participant (submitter, reviewer, manager), **I want to** add comments to a task thread, **so that** all communication about that task is centralized and traceable.

- **Priority:** P1
- **Linked Reqs:** TASK-06

---

#### US-018 — Reassign Task
**As a** compliance manager, **I want to** reassign an open task to a different employee with a mandatory justification note, **so that** workload can be balanced and unavailable staff covered.

- **Priority:** P1
- **Linked Reqs:** TASK-07

---

#### US-019 — Cancel Task
**As a** compliance manager, **I want to** cancel a task that is no longer required, **so that** it is removed from active queues without losing its history.

- **Priority:** P1
- **Linked Reqs:** TASK-08

---

#### US-020 — View Overdue Tasks
**As a** compliance manager, **I want to** see a filtered list of all overdue tasks across my department, **so that** I can prioritize interventions before SLA breaches escalate.

- **Priority:** P0
- **Linked Reqs:** TASK-04, TASK-05

---

### Epic 5: Evidence Submission

#### US-021 — Upload Evidence Files
**As an** evidence submitter, **I want to** upload one or more files (PDF, Word, images) to fulfill a task's evidence requirement, **so that** the reviewer has everything needed to evaluate compliance.

- **Priority:** P0
- **Linked Reqs:** EVID-01, EVID-02, EVID-05

---

#### US-022 — Add Submission Notes
**As an** evidence submitter, **I want to** add explanatory notes alongside my uploaded files, **so that** the reviewer has context for interpreting the evidence.

- **Priority:** P1
- **Linked Reqs:** EVID-05

---

#### US-023 — Receive Virus Scan Result
**As an** evidence submitter, **I want to** be notified if my uploaded file failed virus scanning, **so that** I can upload a clean replacement immediately.

- **Priority:** P0
- **Linked Reqs:** EVID-03, EVID-04, EVID-08

---

#### US-024 — View Submission History
**As an** evidence submitter or reviewer, **I want to** see the full version history of all submissions for an evidence requirement, **so that** I can track the evolution of the evidence across revision cycles.

- **Priority:** P1
- **Linked Reqs:** EVID-06

---

#### US-025 — Receive Submission Confirmation
**As an** evidence submitter, **I want to** receive an in-app and email notification confirming my submission was received, **so that** I have a record and reassurance the submission registered.

- **Priority:** P1
- **Linked Reqs:** EVID-08, NOTIF-01, NOTIF-02

---

### Epic 6: Review Workflow

#### US-026 — View Review Queue
**As a** compliance reviewer, **I want to** see a prioritized queue of submitted evidence awaiting my review, **so that** I can work through reviews systematically without missing anything.

- **Priority:** P0
- **Linked Reqs:** REV-01

---

#### US-027 — Download and Preview Evidence
**As a** compliance reviewer, **I want to** download and preview uploaded evidence files directly in the platform, **so that** I can evaluate content without switching tools.

- **Priority:** P0
- **Linked Reqs:** REV-02

---

#### US-028 — Approve Evidence
**As a** compliance reviewer, **I want to** approve a submitted evidence package with a mandatory comment, **so that** the standard is marked as fulfilled and the completion metric updates.

- **Priority:** P0
- **Linked Reqs:** REV-03, REV-04, REV-05

---

#### US-029 — Reject Evidence
**As a** compliance reviewer, **I want to** reject a submitted evidence package with a clear explanation, **so that** the submitter knows exactly why it was rejected and what to correct.

- **Priority:** P0
- **Linked Reqs:** REV-03, REV-04, REV-06

---

#### US-030 — Request Resubmission
**As a** compliance reviewer, **I want to** request a resubmission with specific guidance (rather than a full rejection), **so that** the submitter can make targeted corrections without starting over.

- **Priority:** P0
- **Linked Reqs:** REV-03, REV-04, REV-06

---

#### US-031 — View Decision History
**As a** compliance reviewer or manager, **I want to** view the complete review decision history for any evidence requirement, **so that** I can understand the full review cycle including previous rejections and comments.

- **Priority:** P1
- **Linked Reqs:** REV-07

---

#### US-032 — Conflict of Interest Prevention
**As the** system, **I will** prevent reviewers from reviewing evidence they themselves submitted, **so that** independence of the review process is guaranteed.

- **Priority:** P0
- **Linked Reqs:** REV-08

---

### Epic 7: Notifications

#### US-033 — Task Assignment Notification
**As an** evidence submitter, **I want to** receive an in-app and email notification when a new task is assigned to me, **so that** I can begin working on it promptly.

- **Priority:** P1
- **Linked Reqs:** NOTIF-01, NOTIF-02

---

#### US-034 — Review Decision Notification
**As an** evidence submitter, **I want to** receive a notification when my submission has been reviewed (approved, rejected, or returned for revision), **so that** I can take the appropriate next action.

- **Priority:** P1
- **Linked Reqs:** NOTIF-01, NOTIF-02

---

#### US-035 — SLA Warning Notification
**As an** evidence submitter and their manager, **I want to** receive an early warning notification when a task is approaching its deadline (48 hours prior), **so that** action can be taken before SLA breach.

- **Priority:** P1
- **Linked Reqs:** NOTIF-01, NOTIF-02

---

#### US-036 — Escalation Notification
**As a** compliance manager, **I want to** receive an escalation notification when a task breaches its SLA, **so that** I can intervene immediately.

- **Priority:** P1
- **Linked Reqs:** NOTIF-01, NOTIF-02, TASK-05

---

#### US-037 — Manage Notification Preferences
**As any** user, **I want to** configure which notifications I receive by email vs. in-app only, **so that** I am not overwhelmed with low-priority alerts.

- **Priority:** P2
- **Linked Reqs:** NOTIF-03

---

### Epic 8: Dashboard & Analytics

#### US-038 — View Overall Compliance Progress
**As a** compliance manager or executive, **I want to** see the overall compliance completion percentage prominently on the dashboard, **so that** I have an immediate status summary at a glance.

- **Priority:** P1
- **Linked Reqs:** DASH-01

---

#### US-039 — Drill Down by Perspective/Axis
**As a** compliance manager, **I want to** drill down from the overall percentage into individual Perspectives and Axes to see granular completion, **so that** I can identify the weakest areas.

- **Priority:** P1
- **Linked Reqs:** DASH-02

---

#### US-040 — View Task KPI Cards
**As a** compliance manager, **I want to** see card-based KPIs for total tasks, open tasks, overdue tasks, and pending reviews, **so that** I can monitor operational health at a glance.

- **Priority:** P1
- **Linked Reqs:** DASH-03

---

#### US-041 — Filter Dashboard by Department
**As a** compliance manager, **I want to** filter the dashboard by department, **so that** I can assess the compliance posture of a specific team.

- **Priority:** P2
- **Linked Reqs:** DASH-07

---

#### US-042 — View Activity Feed
**As a** compliance manager, **I want to** see a real-time activity feed of recent submissions and decisions, **so that** I can quickly understand what has happened in the last 24 hours.

- **Priority:** P2
- **Linked Reqs:** DASH-05

---

### Epic 9: Reports

#### US-043 — Generate Compliance Progress Report
**As a** compliance manager, **I want to** generate a compliance progress report filtered by date range and hierarchy node, **so that** I can share formal progress updates with leadership.

- **Priority:** P1
- **Linked Reqs:** RPT-01, RPT-04

---

#### US-044 — Download Report in PDF or Excel
**As a** compliance manager, **I want to** download generated reports in PDF or Excel format, **so that** I can share them in standard formats with stakeholders who don't have system access.

- **Priority:** P1
- **Linked Reqs:** RPT-02

---

#### US-045 — Receive Notification When Report is Ready
**As a** compliance manager, **I want to** receive a notification when my report has been generated, **so that** I don't need to wait on the screen.

- **Priority:** P1
- **Linked Reqs:** RPT-03, NOTIF-01

---

#### US-046 — Generate Audit Trail Report
**As an** external auditor, **I want to** generate a full audit trail report for a given date range, **so that** I can verify that all decisions and state changes are properly documented.

- **Priority:** P1
- **Linked Reqs:** RPT-06, AUD-05

---

#### US-047 — Generate Report in Arabic
**As a** compliance manager, **I want to** generate reports in Arabic, **so that** reports submitted to Arabic-language authorities are fully localized.

- **Priority:** P1
- **Linked Reqs:** RPT-07

---

### Epic 10: Audit Log

#### US-048 — View Audit Log
**As a** system administrator or external auditor, **I want to** search and filter the audit log by user, entity, action type, and date range, **so that** I can trace any action taken in the system.

- **Priority:** P0
- **Linked Reqs:** AUD-04

---

#### US-049 — Tamper-Proof Audit Records
**As an** external auditor, **I want** assurance that audit log entries cannot be edited or deleted, **so that** the record is a reliable evidence of system activity.

- **Priority:** P0
- **Linked Reqs:** AUD-03

---

#### US-050 — Export Audit Log
**As an** external auditor, **I want to** export the audit log to CSV/Excel, **so that** I can analyze it with external tools.

- **Priority:** P1
- **Linked Reqs:** AUD-05

---

### Epic 11: Localization

#### US-051 — Switch Interface Language
**As any** user, **I want to** toggle between Arabic and English at any time without losing my current context, **so that** I can work in my preferred language.

- **Priority:** P0
- **Linked Reqs:** USE-01, USE-02

---

#### US-052 — View Content in Selected Language
**As any** user, **I want** all compliance hierarchy names, task descriptions, and UI labels to display in my selected language, **so that** there is no language mixing in the interface.

- **Priority:** P0
- **Linked Reqs:** HIER-02, USE-03

---

### Epic 12: Organizational Structure

#### US-053 — Manage Departments
**As a** system administrator, **I want to** create, edit, and archive departments and organizational units, **so that** user-to-department mapping reflects the current org chart.

- **Priority:** P1
- **Linked Reqs:** USR-04

---

#### US-054 — Assign Users to Departments
**As a** system administrator, **I want to** assign users to one or more departments, **so that** managers can filter tasks and reports by organizational unit.

- **Priority:** P1
- **Linked Reqs:** USR-04

---

## 12. Acceptance Criteria

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
- Task is created with status = "Assigned"
- Assignee receives in-app and email notification within 60 seconds
- Task appears in the assignee's task queue
- Audit log entry is created

**Given** a task due date is in the past
**When** the form is submitted
**Then:**
- Validation error is shown: "Due date must be in the future"

---

### AC-003 — Evidence Submission

**Given** an assignee opens their task in "Assigned" or "Resubmission Required" status
**When** they upload one or more valid files and submit
**Then:**
- Task status transitions to "Submitted"
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
- Submitter receives a notification: "File [filename] was quarantined due to a security issue. Please upload a replacement."
- Task reverts to "In Progress" status

---

### AC-004 — Review Decision

**Given** a reviewer has opened a submission in "Submitted" status
**When** they select "Approved" and enter a comment, then confirm
**Then:**
- Task status transitions to "Approved"
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
**When** 48 hours remain before the deadline
**Then:**
- SLA warning notification is sent to the assignee and their manager

**When** the deadline passes without the task reaching "Submitted" status
**Then:**
- Task is flagged as "Overdue"
- Escalation notification is sent to the compliance manager
- Escalation event is logged in the audit trail

---

### AC-006 — Dashboard Refresh

**Given** the dashboard is loaded
**When** a review decision is made (approve/reject) within the same session
**Then:**
- Completion percentages on the dashboard update within 5 minutes (auto-refresh)
- The affected Perspective/Axis/Standard card reflects the new value

---

### AC-007 — Language Toggle

**Given** a user is viewing the interface in English
**When** they click the language toggle
**Then:**
- Interface immediately switches to Arabic
- Layout switches to RTL
- All labels, menu items, and hierarchy names display in Arabic
- No page reload occurs

---

## 13. Out of Scope

The following items are explicitly **not** in scope for version 1.0:

| Item | Rationale |
|------|-----------|
| Mobile native app (iOS/Android) | Web-only for v1; responsive web covers tablet use cases |
| Single Sign-On (SSO) / SAML integration | Planned for v2 after institutional SAML provider is identified |
| AI-powered evidence classification | Future capability; requires labelled training data |
| Real-time collaborative editing | Compliance submissions are sequential, not collaborative documents |
| Public citizen portal | Internal staff use only for v1 |
| Video conferencing / meeting tools | Out of domain for compliance management |
| Financial or HR system integrations | Planned for v2 based on identified systems |
| Offline mode / PWA | Online connectivity required for submission and review workflows |

---

## 14. Assumptions & Constraints

### Assumptions

1. All target users have institutional email accounts provisioned before system launch.
2. The compliance framework (Perspectives, Axes, Standards) is finalized before system launch and loaded as seed data.
3. ClamAV or equivalent antivirus service is available in the deployment environment.
4. MinIO object storage has been provisioned with sufficient capacity (minimum 500 GB initial allocation).
5. An SMTP relay is available for email notifications.
6. SLA windows are defined per task type by the compliance team before launch.
7. All users have access to a modern browser (Chrome 110+, Firefox 115+, Edge 110+).

### Constraints

1. **Language:** UI must support Arabic as the primary language with full RTL layout.
2. **Data Residency:** All data (files, database) must remain on-premise or within the organization's cloud tenant.
3. **HTTPS:** TLS must be enforced at the reverse proxy level before any production traffic.
4. **Role Isolation:** Reviewers must not be able to review their own submissions (technical enforcement required).
5. **Audit Immutability:** Audit log records must not be editable or deletable by any user, including admins.
6. **Budget:** No third-party SaaS per-seat licenses; all infrastructure components must be self-hosted.

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Slow adoption by evidence submitters unfamiliar with digital workflows | High | High | Mandatory onboarding training; simple UX; Arabic-first design |
| Compliance hierarchy data missing or incomplete at launch | Medium | High | Dedicated data preparation sprint; admin seeding tools |
| ClamAV not available in deployment environment | Medium | Medium | Provide bypass flag for non-production; document ClamAV setup; scan at upload, flag pending |
| Database completion recalculation triggers causing performance spikes | Medium | Medium | Batch recalculation; async trigger via queue; materialized views |
| SLA configuration errors leading to false escalations | Low | Medium | Provide SLA configuration UI with preview; admin can suppress escalations per task |
| JWT/session token security vulnerabilities | Medium | High | Move access token from localStorage to httpOnly cookie; rotate refresh tokens on use |
| File storage quota exceeded | Low | High | Implement storage monitoring; alert at 80% capacity; configure lifecycle policies |
| Email notification delivery failures | Medium | Low | Retry with backoff (3 attempts); fallback to in-app only; dead-letter queue monitoring |

---

## 16. Glossary

| Term | Definition |
|------|------------|
| **Perspective** | Top-level compliance category (e.g., "Governance & Leadership") |
| **Axis** | Second-level subdivision of a Perspective (e.g., "Strategic Planning") |
| **Standard** | Specific compliance requirement within an Axis (e.g., "STD-001: Vision Documentation") |
| **Evidence Requirement** | Leaf-level artifact required to satisfy a Standard (e.g., "Upload signed vision statement") |
| **Evidence Submission** | A user's upload of files to fulfill an Evidence Requirement |
| **Review Decision** | A reviewer's verdict on a submission: Approved, Rejected, or Resubmission Required |
| **Completion Percentage** | Ratio of approved evidence requirements to total requirements at any hierarchy level |
| **SLA** | Service Level Agreement — maximum time allowed to complete a task |
| **Escalation** | Automatic notification triggered when an SLA is breached |
| **Audit Log** | Immutable, append-only record of every state-changing action in the system |
| **RBAC** | Role-Based Access Control — permissions granted by role, not individual user |
| **RTL** | Right-to-Left text layout (required for Arabic language) |
| **Bull Queue** | Redis-based background job processing library |
| **MinIO** | Self-hosted, S3-compatible object storage for evidence files |
| **CSRF** | Cross-Site Request Forgery — attack type prevented by CSRF tokens |
| **Soft Delete** | Marking a record as deleted (via `deleted_at` timestamp) without removing it from the database |
| **Materialized View** | Pre-computed database snapshot used to serve dashboard queries efficiently |

---

*Document End*

---

**Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-09 | Senior Engineering Team | Initial release |
| 1.1 | 2026-03-09 | Senior Engineering Team | Added Section 10: Business Rules (BR-AUTH, BR-USR, BR-HIER, BR-TASK, BR-EVID, BR-REV, BR-SLA, BR-NOTIF, BR-DASH, BR-AUD, BR-FILE, BR-LANG) |
