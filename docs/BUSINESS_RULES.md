# Business Rules
# Qiyas — Digital Evidence & Compliance Management Platform

**Version:** 1.0
**Date:** 2026-03-09
**Author:** Senior Engineering Team

> **Related Documents:** [`PRD.md`](./PRD.md) · [`USER_STORIES.md`](./USER_STORIES.md) · [`DATA_MODEL.md`](./DATA_MODEL.md)

---

## Overview

Business rules define the **invariant logic** that governs how the system behaves, regardless of who the actor is. These rules are non-negotiable and must be enforced at the **application layer** and, where applicable, at the **database layer** (constraints, triggers, row-level security) to ensure data integrity, security, and compliance.

**Enforcement layers:**
- `[APP]` — Enforced in backend service/controller code
- `[DB]` — Enforced via database constraint, trigger, or RLS policy
- `[APP+DB]` — Dual enforcement required

---

## Table of Contents

1. [BR-AUTH — Authentication & Session](#br-auth--authentication--session)
2. [BR-USR — User & Role Management](#br-usr--user--role-management)
3. [BR-HIER — Compliance Hierarchy](#br-hier--compliance-hierarchy)
4. [BR-TASK — Task Management](#br-task--task-management)
5. [BR-EVID — Evidence Submission](#br-evid--evidence-submission)
6. [BR-REV — Review Workflow](#br-rev--review-workflow)
7. [BR-SLA — SLA & Escalation](#br-sla--sla--escalation)
8. [BR-NOTIF — Notifications](#br-notif--notifications)
9. [BR-DASH — Dashboard & Reporting](#br-dash--dashboard--reporting)
10. [BR-AUD — Audit & Data Integrity](#br-aud--audit--data-integrity)
11. [BR-FILE — File Management](#br-file--file-management)
12. [BR-LANG — Language & Localization](#br-lang--language--localization)

---

## BR-AUTH — Authentication & Session

| ID | Rule | Layer |
|----|------|-------|
| BR-AUTH-01 | A user may not log in with a deactivated account. Deactivation takes effect immediately; any active sessions are invalidated by purging all refresh tokens for that user. | APP+DB |
| BR-AUTH-02 | After 5 consecutive failed login attempts from the same account, the account is locked for 30 minutes. The failed-attempt counter resets on successful login. | APP |
| BR-AUTH-03 | Access tokens expire after **15 minutes**. Refresh tokens expire after **7 days**. A new refresh token is issued on every successful refresh (token rotation). | APP |
| BR-AUTH-04 | A revoked refresh token may not be reused. Attempted reuse of a previously revoked token is treated as a token replay attack; all sessions for that user are immediately invalidated. | APP+DB |
| BR-AUTH-05 | All state-changing API requests (`POST`, `PUT`, `PATCH`, `DELETE`) must include a valid CSRF token in the request header matching the CSRF cookie. Requests without a valid token are rejected with HTTP 403. | APP |
| BR-AUTH-06 | A user may have at most **5 concurrent active sessions** (distinct refresh tokens). When a new login exceeds this limit, the oldest session (by `created_at`) is invalidated automatically. | APP |

---

## BR-USR — User & Role Management

| ID | Rule | Layer |
|----|------|-------|
| BR-USR-01 | Every user must have at least one assigned role at all times. An attempt to remove the last role from a user must be rejected. | APP+DB |
| BR-USR-02 | A user may hold multiple roles simultaneously. Effective permissions are the **union** of all permissions granted to all assigned roles. | APP |
| BR-USR-03 | A role may not be deleted if it is currently assigned to one or more active users. The role must first be unassigned from all users. | APP+DB |
| BR-USR-04 | Only users holding the `admin` role may create, modify, or deactivate user accounts. | APP |
| BR-USR-05 | A user cannot deactivate their own account, even if they hold the `admin` role. | APP |
| BR-USR-06 | Deactivating a user does **not** delete their submissions, tasks, review decisions, or audit records. All historical data is preserved. | APP+DB |
| BR-USR-07 | Email addresses are unique system-wide. Two users may not share the same email address. | DB |
| BR-USR-08 | Role and permission changes take effect on the user's **next API request** (i.e., after their current access token expires and a new one is issued). Active access tokens are not retroactively invalidated. | APP |

---

## BR-HIER — Compliance Hierarchy

| ID | Rule | Layer |
|----|------|-------|
| BR-HIER-01 | Every Standard must belong to exactly one Axis. Every Axis must belong to exactly one Perspective. Orphaned nodes (without a parent) are not permitted. | DB |
| BR-HIER-02 | An Axis cannot be created without specifying a parent Perspective. A Standard cannot be created without specifying a parent Axis. An Evidence Requirement cannot be created without specifying a parent Standard. | APP+DB |
| BR-HIER-03 | Archiving a Perspective **cascades**: all child Axes, Standards, and Evidence Requirements are archived in the same transaction. | APP+DB |
| BR-HIER-04 | Archived hierarchy nodes are invisible in all standard user-facing queries. They are accessible only to `admin` users via an explicit `include_archived=true` query parameter. | APP |
| BR-HIER-05 | A hierarchy node that has one or more **open tasks** (any status except `closed` or `cancelled`) may not be archived. The admin must close or cancel all open tasks first. | APP |
| BR-HIER-06 | Completion percentage at any level is calculated as: `ROUND((approved_evidence_requirements / total_active_evidence_requirements) * 100, 1)`. A level with zero evidence requirements reports `0.0%`. | DB (trigger) |
| BR-HIER-07 | A Standard's `completion_status` field maps from its completion percentage: `0%` → `not_started`, `1–99%` → `in_progress`, `100%` → `completed`. | DB (trigger) |
| BR-HIER-08 | Completion percentages must be **recalculated synchronously** upon any review decision (approve/reject). The system must never display a stale percentage after a review decision has been committed. | APP+DB |

---

## BR-TASK — Task Management

| ID | Rule | Layer |
|----|------|-------|
| BR-TASK-01 | A task must be linked to at least one Evidence Requirement at creation time. A task without an Evidence Requirement link is rejected. | APP+DB |
| BR-TASK-02 | A task's `due_date` must be a future datetime at the time of creation. Tasks cannot be created with a past due date. | APP |
| BR-TASK-03 | The task status machine is strictly enforced. The only permitted transitions are defined below. Any other transition is rejected with HTTP 422. | APP+DB |

**Task Status State Machine:**

```
[Draft] ──────────────────────────────────► [Assigned]
                                                │
                                    (assignee action)
                                                │
                                                ▼
                                          [In Progress]
                                                │
                                    (assignee submits)
                                                │
                                                ▼
                                          [Submitted]
                                                │
                                   (reviewer picks up)
                                                │
                                                ▼
                                         [Under Review]
                                          │    │    │
                         (approved)       │    │    │  (rejected)
                    ┌─────────────────────┘    │    └─────────────────────────┐
                    ▼                          │ (resubmission required)      ▼
               [Approved]                      ▼                         [Rejected]
                    │                  [Resubmission Required]                │
                    │                          │                              │
                    │               (assignee resubmits)                      │
                    │                          │                              │
                    │                          ▼                              │
                    │                    [In Progress] ──► (loop)             │
                    │                                                         │
                    └──────────────────────────┬──────────────────────────────┘
                                               │  (manager closes)
                                               ▼
                                           [Closed]  ◄── terminal

Any non-terminal state ──► [Cancelled]  (manager only, mandatory reason)
```

| ID | Rule | Layer |
|----|------|-------|
| BR-TASK-04 | Only the **assigned user** may transition a task from `Assigned` → `In Progress`. Managers and admins cannot perform this transition on behalf of the assignee. | APP |
| BR-TASK-05 | Only a **Compliance Manager or Admin** may reassign a task. Reassignment requires a mandatory justification note (minimum 10 characters), which is written to task comments and the audit log. | APP |
| BR-TASK-06 | A task in `Approved`, `Rejected`, or `Closed` status **cannot be reopened** except by an Admin. Admin reopening voids the prior decision and resets the completion contribution of the linked evidence requirement. | APP |
| BR-TASK-07 | Cancelling a task requires a mandatory cancellation reason (minimum 10 characters). Cancelled tasks are soft-deleted (`deleted_at` set) and removed from all active queues, but remain visible in task history. | APP |
| BR-TASK-08 | A task's `due_date` cannot be set to a past date, even by a manager editing an existing task. | APP |
| BR-TASK-09 | The SLA clock **starts** when the task first transitions to `Assigned`. The SLA clock **pauses** while the task is in `Under Review` status (review time is excluded from SLA calculation). | APP |
| BR-TASK-10 | A task is flagged `is_overdue = true` the moment its `due_date` passes and its status has not reached `Submitted`, `Approved`, or `Closed`. This check runs every 5 minutes via the SLA monitor job. | APP (cron) |

---

## BR-EVID — Evidence Submission

| ID | Rule | Layer |
|----|------|-------|
| BR-EVID-01 | Evidence can only be submitted when the linked task is in `Assigned`, `In Progress`, or `Resubmission Required` status. Submission attempts in any other status are rejected with HTTP 422. | APP |
| BR-EVID-02 | A submission must include at least one uploaded file. Notes-only submissions (text with no file attachment) are not permitted. | APP |
| BR-EVID-03 | Permitted file MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX), `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX), `application/vnd.openxmlformats-officedocument.presentationml.presentation` (PPTX), `image/png`, `image/jpeg`, `video/mp4`, `application/zip`. All other MIME types are rejected at upload. | APP |
| BR-EVID-04 | Maximum size per individual file: **50 MB**. Maximum total submission size: **200 MB**. Both limits are enforced at upload time before the file is written to storage. | APP |
| BR-EVID-05 | Every uploaded file must pass virus scanning before it is accessible for review or download. Files with `virus_scan_status = 'pending'` or `'scanning'` cannot be downloaded by any user. | APP |
| BR-EVID-06 | A quarantined file (`virus_scan_status = 'quarantined'`) is permanently inaccessible to all users, including admins. Quarantined files are never deleted from storage (retained for forensic purposes). | APP+DB |
| BR-EVID-07 | Every submission creates a new **version record**. Previous submissions for the same evidence requirement are retained and remain viewable in version history. No prior submission is overwritten or deleted. | APP+DB |
| BR-EVID-08 | A submitter cannot delete an uploaded file once the linked task has advanced to `Submitted` or any later status. | APP |
| BR-EVID-09 | File names are **sanitized** on upload: path traversal sequences (`../`, `..\\`), null bytes, and non-printable characters are stripped. The sanitized name is stored. The original, unsanitized name is also stored as `original_filename` metadata. | APP |

---

## BR-REV — Review Workflow

| ID | Rule | Layer |
|----|------|-------|
| BR-REV-01 | A reviewer **cannot review evidence they personally submitted**. This restriction applies regardless of the user's roles. The system checks `evidence_submission.submitted_by = current_user.id` and blocks the action if true. | APP |
| BR-REV-02 | A review decision (Approve / Reject / Resubmission Required) requires a mandatory comment of **at least 10 characters**. Whitespace-only comments are treated as empty and rejected. | APP |
| BR-REV-03 | Only one review decision may be **active** per submission. If a second reviewer submits a decision on the same submission, it supersedes the first. Both decisions are retained in the `review_decisions` history table. | APP |
| BR-REV-04 | An `Approved` decision on a task **cannot be reversed directly**. To reverse, an Admin must reopen the task (`BR-TASK-06`), which voids the approval and resets the evidence requirement's completion contribution to zero. | APP |
| BR-REV-05 | A reviewer may not submit an `Approved` decision on a submission that contains any file with `virus_scan_status` other than `'clean'`. The approve button is disabled in the UI and blocked at the API layer. | APP |
| BR-REV-06 | After a `Resubmission Required` decision: the task status returns to `In Progress`; the submitter is notified with the reviewer's comment; and the next submission creates a new evidence version. | APP |
| BR-REV-07 | After a `Rejected` decision: the task moves to `Rejected` status (terminal). To retry, the Compliance Manager must create a **new task**. The rejected task is not reopened. | APP |
| BR-REV-08 | The review queue shows only submissions where the reviewer has been explicitly assigned **or** holds the `can_review_evidence` permission scoped to the relevant hierarchy node's department. | APP |

---

## BR-SLA — SLA & Escalation

| ID | Rule | Layer |
|----|------|-------|
| BR-SLA-01 | SLA duration is configured per task type in business days. "Business days" exclude weekends (Saturday/Sunday) and public holidays defined in the `public_holidays` configuration table. | APP |
| BR-SLA-02 | An **SLA warning** notification is triggered automatically when a task has **48 or fewer business hours** remaining before its `due_date` and the task is not yet in `Submitted` or `Approved` status. | APP (cron) |
| BR-SLA-03 | A **first-level escalation** event is triggered the moment a task's `due_date` passes and the task is still not `Submitted` or `Approved`. Notifications are sent to: the task assignee, their direct manager (`users.manager_id`), and the Compliance Manager. | APP (cron) |
| BR-SLA-04 | All escalation events are written as immutable records to the `escalation_events` table and to the `audit_logs` table. Escalation events cannot be dismissed, suppressed, or deleted by any user role. | APP+DB |
| BR-SLA-05 | A **second-level escalation** is triggered if the task remains `Overdue` for more than **3 additional business days** after the first-level escalation. The second-level escalation sends notifications to the department director. | APP (cron) |
| BR-SLA-06 | SLA is considered **met** if the task reaches `Submitted` status before or on the `due_date`, even if the review decision (approve/reject) comes after the due date. | APP |
| BR-SLA-07 | Retroactively changing a task's `due_date` after a breach has occurred does **not** clear the `is_overdue` flag or remove the escalation event from the audit log. The breach event is immutable. | APP+DB |

---

## BR-NOTIF — Notifications

| ID | Rule | Layer |
|----|------|-------|
| BR-NOTIF-01 | The following notification events are **mandatory** and cannot be disabled by the user: task assignment, first-level SLA escalation, second-level SLA escalation, account lockout. | APP |
| BR-NOTIF-02 | The following notification events are **enabled by default** but can be disabled per user via notification preferences: submission confirmation, review decision received, SLA warning (48h), report generation complete. | APP |
| BR-NOTIF-03 | In-app notifications must be delivered within **60 seconds** of the triggering event. Email notifications are delivered asynchronously via the job queue, with a target delivery of 60 seconds and a maximum of **3 retry attempts** using exponential backoff (delays: 30s, 2m, 10m). | APP |
| BR-NOTIF-04 | If all 3 email delivery retries are exhausted, a dead-letter queue entry is created and an admin-only system alert is generated. The corresponding in-app notification is unaffected. | APP |
| BR-NOTIF-05 | All notification content (subject, body) is rendered in the **recipient's configured language** preference (Arabic or English). | APP |
| BR-NOTIF-06 | If **10 or more tasks** from the same department breach SLA simultaneously within a 5-minute window, those escalation notifications are batched into a single **digest notification** per recipient to prevent inbox flooding. | APP |

---

## BR-DASH — Dashboard & Reporting

| ID | Rule | Layer |
|----|------|-------|
| BR-DASH-01 | Dashboard KPI data is served from a **materialized view snapshot** (`dashboard_snapshots`). The snapshot is refreshed every **5 minutes** via a scheduled background job. | APP (cron) |
| BR-DASH-02 | If the materialized view refresh job fails, the dashboard serves the **last successful snapshot** and displays a visible "Data as of [timestamp]" indicator. The dashboard does not show an error page or stale percentage without the timestamp indicator. | APP |
| BR-DASH-03 | Report generation jobs are processed asynchronously. A single user may not have more than **3 pending report jobs** simultaneously. A fourth request is rejected with HTTP 429 until one job completes. | APP |
| BR-DASH-04 | Generated report files are automatically **purged from object storage 30 days** after their `generated_at` timestamp. A scheduled cleanup job runs daily. | APP (cron) |
| BR-DASH-05 | Report files are **private to the requesting user**. No other user (including admins) can download a report file they did not generate. Admins can regenerate any report themselves. | APP |
| BR-DASH-06 | Completion percentages displayed in generated reports reflect the **state at report generation time** (snapshot semantics). The report header always includes the generation timestamp. | APP |

---

## BR-AUD — Audit & Data Integrity

| ID | Rule | Layer |
|----|------|-------|
| BR-AUD-01 | Every `CREATE`, `UPDATE`, `DELETE`, and status-change operation on any business entity writes an audit log entry. Read-only operations (`SELECT`) are **not** logged, except for: user login, user logout, file download. | APP |
| BR-AUD-02 | Audit log entries are **immutable**. No user role — including `admin` — may edit or delete an `audit_logs` row. This is enforced at the database level: no `UPDATE` or `DELETE` permissions are granted on the `audit_logs` table to any application role. | DB |
| BR-AUD-03 | Every audit log entry must capture all of the following fields. An entry missing any mandatory field must not be committed. Mandatory fields: `user_id`, `action`, `entity_type`, `entity_id`, `before_value` (JSONB, `null` for creates), `after_value` (JSONB, `null` for deletes), `ip_address`, `user_agent`, `created_at`. | APP+DB |
| BR-AUD-04 | Soft deletes (`deleted_at` timestamp) are used for **all user-facing entities**. Hard deletes are permitted only for: pre-scan temporary files, expired report files (>30 days), and expired refresh tokens. | APP+DB |
| BR-AUD-05 | Minimum retention periods (cannot be reduced via admin configuration): Audit logs — **7 years**. Evidence files — **5 years after task closure date**. A scheduled archival job enforces these minimums and prevents premature deletion. | APP+DB |
| BR-AUD-06 | All database mutations that involve both a business entity change and an audit log write must be executed in a **single transaction**. If the audit log write fails, the business entity change is rolled back. | APP+DB |

---

## BR-FILE — File Management

| ID | Rule | Layer |
|----|------|-------|
| BR-FILE-01 | All file access is via **signed, time-limited pre-signed URLs** (15-minute expiry). Direct object storage URLs (MinIO internal URLs) are never returned to the client. | APP |
| BR-FILE-02 | File storage keys (object paths) are **UUID-based** and do not contain or reflect the original file name. This prevents enumeration and path-based access control bypass. | APP |
| BR-FILE-03 | **Duplicate file detection:** If the same SHA-256 hash is uploaded to the same evidence requirement by the same user within a 10-minute window, the second upload is rejected with: "This file has already been uploaded." | APP |
| BR-FILE-04 | Uploading a file to a task **does not automatically transition the task to `Submitted`**. The submitter must explicitly click a "Submit" action to trigger the status transition. | APP |
| BR-FILE-05 | All files are stored with **server-side encryption (SSE)** enabled in MinIO (`SSE-S3` or `SSE-KMS`). Files at rest must never be stored unencrypted. | APP (config) |

---

## BR-LANG — Language & Localization

| ID | Rule | Layer |
|----|------|-------|
| BR-LANG-01 | All hierarchy nodes (Perspective, Axis, Standard, Evidence Requirement) must have both an **Arabic name** (`name_ar`) and an **English name** (`name_en`). Neither field may be blank or null. | APP+DB |
| BR-LANG-02 | The system UI must render **entirely** in the active language. There must be no mixing of Arabic and English strings within the same rendered page, except for: proper nouns, internationally recognized acronyms (e.g., "PDF", "URL"), and numeric data. | APP |
| BR-LANG-03 | Dates are formatted as Gregorian calendar for both languages. When Arabic is active, **Arabic-Indic numerals** (٠١٢٣٤٥٦٧٨٩) are used by default; this behavior is configurable at the system level. | APP |
| BR-LANG-04 | Language preference is stored on the `users` table (`language_preference` field) and **persists across sessions**. The last selected language is also cached in a cookie as a fallback for pre-login pages. | APP |
| BR-LANG-05 | All of the following must be available in both Arabic and English: validation error messages, notification email templates, generated report content, and system alert messages. | APP |

---

*Document End*

---

**Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-09 | Senior Engineering Team | Extracted from monolithic PRD.md v1.1; added enforcement layer column and detailed implementation notes |
