# Product Requirements Document (PRD)
# Qiyas — Digital Evidence & Compliance Management Platform

**Version:** 2.0
**Date:** 2026-03-09
**Author:** Senior Engineering Team
**Status:** Approved for Development

> **Companion Documents**
> - [`USER_STORIES.md`](./USER_STORIES.md) — All user stories and acceptance criteria
> - [`BUSINESS_RULES.md`](./BUSINESS_RULES.md) — System-wide invariant business rules
> - [`DATA_MODEL.md`](./DATA_MODEL.md) — Database schema, entities, and relationships

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
10. [Out of Scope](#10-out-of-scope)
11. [Assumptions & Constraints](#11-assumptions--constraints)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Glossary](#13-glossary)

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

## 10. Out of Scope

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

## 11. Assumptions & Constraints

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

## 12. Risks & Mitigations

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

## 13. Glossary

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
| 1.0 | 2026-03-09 | Senior Engineering Team | Initial release (monolithic document) |
| 2.0 | 2026-03-09 | Senior Engineering Team | Split into 4 companion documents; PRD now contains core requirements only |
