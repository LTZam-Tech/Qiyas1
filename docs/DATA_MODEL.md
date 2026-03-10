# Data Model
# Qiyas — Digital Evidence & Compliance Management Platform

**Version:** 1.0
**Date:** 2026-03-09
**Author:** Senior Engineering Team
**Database:** PostgreSQL 15+

> **Related Documents:** [`PRD.md`](./PRD.md) · [`USER_STORIES.md`](./USER_STORIES.md) · [`BUSINESS_RULES.md`](./BUSINESS_RULES.md)

---

## Table of Contents

1. [Entity Relationship Overview](#1-entity-relationship-overview)
2. [Enumerations (ENUMs)](#2-enumerations-enums)
3. [Access Control Domain](#3-access-control-domain)
4. [Organizational Structure Domain](#4-organizational-structure-domain)
5. [Compliance Hierarchy Domain](#5-compliance-hierarchy-domain)
6. [Task & Workflow Domain](#6-task--workflow-domain)
7. [Evidence & Review Domain](#7-evidence--review-domain)
8. [Notifications Domain](#8-notifications-domain)
9. [SLA & Escalation Domain](#9-sla--escalation-domain)
10. [Reporting Domain](#10-reporting-domain)
11. [Audit Domain](#11-audit-domain)
12. [Key Indexes](#12-key-indexes)
13. [Key Constraints & Triggers](#13-key-constraints--triggers)

---

## 1. Entity Relationship Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ACCESS CONTROL                                │
│                                                                      │
│  users ──── user_roles ──── roles ──── role_permissions ──── permissions │
│    │                                                                  │
│    └──── refresh_tokens                                              │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────────────┐
│                   ORGANIZATIONAL STRUCTURE                           │
│                                                                      │
│  users ──── user_departments ──── departments                       │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────────────┐
│                  COMPLIANCE HIERARCHY                                │
│                                                                      │
│  perspectives (1)                                                    │
│       └── axes (N)                                                   │
│            └── standards (N)                                         │
│                 └── evidence_requirements (N)                        │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────────────┐
│                    TASK & WORKFLOW                                   │
│                                                                      │
│  tasks (assigned_to → users, created_by → users)                    │
│    ├── task_evidence_requirements (M2M → evidence_requirements)     │
│    ├── task_comments (N, author → users)                            │
│    └── sla_policies (1)                                             │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────────────┐
│                  EVIDENCE & REVIEW                                   │
│                                                                      │
│  tasks (1)                                                           │
│    └── evidence_submissions (N, submitted_by → users)               │
│          ├── evidence_files (N)                                      │
│          └── review_decisions (N, reviewed_by → users)              │
└──────────────────┬───────────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────────────┐
│            NOTIFICATIONS / SLA / AUDIT / REPORTS                    │
│                                                                      │
│  notifications (user → users)                                       │
│  notification_preferences (user → users)                            │
│  escalation_events (task → tasks)                                   │
│  report_jobs (requested_by → users)                                 │
│  audit_logs (user_id → users, entity polymorphic)                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Enumerations (ENUMs)

### `task_status`
| Value | Description |
|-------|-------------|
| `draft` | Created but not yet assigned |
| `assigned` | Assigned to a user; SLA clock starts |
| `in_progress` | Assignee has acknowledged the task |
| `submitted` | Evidence files have been submitted |
| `under_review` | Reviewer is actively reviewing; SLA paused |
| `approved` | Review decision: approved |
| `rejected` | Review decision: rejected (terminal) |
| `resubmission_required` | Review decision: submitter must revise |
| `closed` | Task completed and closed (terminal) |
| `cancelled` | Task cancelled by manager (terminal) |

### `review_decision_type`
| Value | Description |
|-------|-------------|
| `approved` | Evidence meets the standard |
| `rejected` | Evidence does not meet the standard; new task required |
| `resubmission_required` | Evidence needs revision; same task continues |

### `virus_scan_status`
| Value | Description |
|-------|-------------|
| `pending` | File uploaded; scan not yet started |
| `scanning` | Scan in progress |
| `clean` | File passed; accessible for download |
| `quarantined` | Malware detected; file permanently inaccessible |

### `completion_status`
| Value | Description |
|-------|-------------|
| `not_started` | 0% of evidence requirements approved |
| `in_progress` | 1–99% of evidence requirements approved |
| `completed` | 100% of evidence requirements approved |

### `notification_event_type`
| Value | Description |
|-------|-------------|
| `task_assigned` | A task has been assigned to the user |
| `task_status_changed` | Task status has changed |
| `submission_received` | Evidence submission confirmed |
| `review_decision` | A review decision has been made |
| `sla_warning` | Task approaching deadline (48h) |
| `sla_breach_l1` | First-level escalation triggered |
| `sla_breach_l2` | Second-level escalation triggered |
| `account_locked` | Account locked due to failed attempts |
| `report_ready` | Async report generation complete |

### `escalation_level`
| Value | Description |
|-------|-------------|
| `warning` | 48-hour pre-deadline warning |
| `level_1` | Deadline passed; direct manager notified |
| `level_2` | 3 business days overdue; department director notified |

### `report_status`
| Value | Description |
|-------|-------------|
| `queued` | Job accepted and waiting in queue |
| `processing` | Job currently being generated |
| `completed` | File ready for download |
| `failed` | Generation failed after retries |

### `report_format`
| Value | Description |
|-------|-------------|
| `pdf` | PDF format |
| `excel` | Excel (.xlsx) format |

### `language_preference`
| Value | Description |
|-------|-------------|
| `ar` | Arabic (default) |
| `en` | English |

---

## 3. Access Control Domain

### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Unique user identifier |
| `full_name_ar` | `varchar(200)` | NOT NULL | Full name in Arabic |
| `full_name_en` | `varchar(200)` | NOT NULL | Full name in English |
| `email` | `varchar(255)` | NOT NULL, UNIQUE | Institutional email address |
| `password_hash` | `varchar(255)` | NOT NULL | bcrypt hash (cost ≥ 12) |
| `is_active` | `boolean` | NOT NULL, default `true` | Whether account can log in |
| `is_locked` | `boolean` | NOT NULL, default `false` | Locked due to failed login attempts |
| `locked_until` | `timestamptz` | NULL | Auto-unlock timestamp |
| `failed_login_count` | `smallint` | NOT NULL, default `0` | Consecutive failed attempts |
| `language_preference` | `language_preference` | NOT NULL, default `'ar'` | UI language setting |
| `manager_id` | `uuid` | FK → `users.id`, NULL | Direct manager (for escalation routing) |
| `last_login_at` | `timestamptz` | NULL | Timestamp of last successful login |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Last update timestamp |
| `deleted_at` | `timestamptz` | NULL | Soft delete timestamp |

---

### `roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Role identifier |
| `name` | `varchar(100)` | NOT NULL, UNIQUE | System role name (e.g., `admin`) |
| `display_name_ar` | `varchar(200)` | NOT NULL | Display name in Arabic |
| `display_name_en` | `varchar(200)` | NOT NULL | Display name in English |
| `is_system_role` | `boolean` | NOT NULL, default `false` | System roles cannot be deleted |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

**Seed data (system roles):** `admin`, `compliance_manager`, `compliance_reviewer`, `evidence_submitter`, `external_auditor`

---

### `user_roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | `uuid` | FK → `users.id`, NOT NULL | — |
| `role_id` | `uuid` | FK → `roles.id`, NOT NULL | — |
| `assigned_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `assigned_by` | `uuid` | FK → `users.id`, NOT NULL | Admin who made the assignment |

**PK:** (`user_id`, `role_id`)

---

### `permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Permission identifier |
| `module` | `varchar(100)` | NOT NULL | System module (e.g., `tasks`) |
| `action` | `varchar(100)` | NOT NULL | Action (e.g., `create`, `review`) |
| `description_en` | `text` | NOT NULL | Human-readable description |

**UNIQUE:** (`module`, `action`)

**Example permissions:** `tasks:create`, `tasks:reassign`, `evidence:submit`, `evidence:review`, `hierarchy:manage`, `users:manage`, `audit:read`, `reports:generate`

---

### `role_permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `role_id` | `uuid` | FK → `roles.id`, NOT NULL | — |
| `permission_id` | `uuid` | FK → `permissions.id`, NOT NULL | — |

**PK:** (`role_id`, `permission_id`)

---

### `refresh_tokens`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Token record identifier |
| `user_id` | `uuid` | FK → `users.id`, NOT NULL | Token owner |
| `token_hash` | `varchar(255)` | NOT NULL, UNIQUE | SHA-256 hash of the raw token |
| `user_agent` | `text` | NULL | Client user agent string |
| `ip_address` | `inet` | NULL | IP address at issuance |
| `expires_at` | `timestamptz` | NOT NULL | Token expiry (7 days from issuance) |
| `revoked_at` | `timestamptz` | NULL | Set when token is revoked |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

---

## 4. Organizational Structure Domain

### `departments`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Department identifier |
| `name_ar` | `varchar(300)` | NOT NULL | Department name in Arabic |
| `name_en` | `varchar(300)` | NOT NULL | Department name in English |
| `parent_id` | `uuid` | FK → `departments.id`, NULL | Parent department (for nested orgs) |
| `director_id` | `uuid` | FK → `users.id`, NULL | Department director (L2 escalation target) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `deleted_at` | `timestamptz` | NULL | Soft delete |

---

### `user_departments`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | `uuid` | FK → `users.id`, NOT NULL | — |
| `department_id` | `uuid` | FK → `departments.id`, NOT NULL | — |
| `is_primary` | `boolean` | NOT NULL, default `false` | Primary department for reporting |

**PK:** (`user_id`, `department_id`)

---

## 5. Compliance Hierarchy Domain

### `perspectives`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Perspective identifier |
| `code` | `varchar(20)` | NOT NULL, UNIQUE | Short code (e.g., `P1`) |
| `name_ar` | `varchar(500)` | NOT NULL | Name in Arabic |
| `name_en` | `varchar(500)` | NOT NULL | Name in English |
| `description_ar` | `text` | NULL | Description in Arabic |
| `description_en` | `text` | NULL | Description in English |
| `sort_order` | `smallint` | NOT NULL, default `0` | Display ordering |
| `completion_pct` | `numeric(5,1)` | NOT NULL, default `0.0` | Calculated completion percentage |
| `completion_status` | `completion_status` | NOT NULL, default `'not_started'` | Derived from completion_pct |
| `created_by` | `uuid` | FK → `users.id`, NOT NULL | — |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `archived_at` | `timestamptz` | NULL | Soft archive timestamp |

---

### `axes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Axis identifier |
| `perspective_id` | `uuid` | FK → `perspectives.id`, NOT NULL | Parent perspective |
| `code` | `varchar(20)` | NOT NULL, UNIQUE | Short code (e.g., `A1.1`) |
| `name_ar` | `varchar(500)` | NOT NULL | — |
| `name_en` | `varchar(500)` | NOT NULL | — |
| `description_ar` | `text` | NULL | — |
| `description_en` | `text` | NULL | — |
| `sort_order` | `smallint` | NOT NULL, default `0` | — |
| `completion_pct` | `numeric(5,1)` | NOT NULL, default `0.0` | — |
| `completion_status` | `completion_status` | NOT NULL, default `'not_started'` | — |
| `created_by` | `uuid` | FK → `users.id`, NOT NULL | — |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `archived_at` | `timestamptz` | NULL | — |

---

### `standards`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Standard identifier |
| `axis_id` | `uuid` | FK → `axes.id`, NOT NULL | Parent axis |
| `code` | `varchar(20)` | NOT NULL, UNIQUE | Short code (e.g., `STD-001`) |
| `name_ar` | `varchar(500)` | NOT NULL | — |
| `name_en` | `varchar(500)` | NOT NULL | — |
| `description_ar` | `text` | NULL | — |
| `description_en` | `text` | NULL | — |
| `sort_order` | `smallint` | NOT NULL, default `0` | — |
| `completion_pct` | `numeric(5,1)` | NOT NULL, default `0.0` | — |
| `completion_status` | `completion_status` | NOT NULL, default `'not_started'` | — |
| `created_by` | `uuid` | FK → `users.id`, NOT NULL | — |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `archived_at` | `timestamptz` | NULL | — |

---

### `evidence_requirements`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Evidence requirement identifier |
| `standard_id` | `uuid` | FK → `standards.id`, NOT NULL | Parent standard |
| `code` | `varchar(30)` | NOT NULL, UNIQUE | Short code (e.g., `ER-001`) |
| `name_ar` | `varchar(500)` | NOT NULL | Requirement name in Arabic |
| `name_en` | `varchar(500)` | NOT NULL | Requirement name in English |
| `description_ar` | `text` | NULL | Detailed instructions in Arabic |
| `description_en` | `text` | NULL | Detailed instructions in English |
| `is_approved` | `boolean` | NOT NULL, default `false` | True when an approved submission exists |
| `sort_order` | `smallint` | NOT NULL, default `0` | — |
| `created_by` | `uuid` | FK → `users.id`, NOT NULL | — |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `archived_at` | `timestamptz` | NULL | — |

---

## 6. Task & Workflow Domain

### `sla_policies`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Policy identifier |
| `name_ar` | `varchar(200)` | NOT NULL | Policy name in Arabic |
| `name_en` | `varchar(200)` | NOT NULL | Policy name in English |
| `duration_business_days` | `smallint` | NOT NULL, CHECK (> 0) | Business days allowed |
| `warning_threshold_hours` | `smallint` | NOT NULL, default `48` | Hours before due to send warning |
| `l2_escalation_days` | `smallint` | NOT NULL, default `3` | Days overdue before L2 escalation |
| `is_default` | `boolean` | NOT NULL, default `false` | Applied when no explicit policy is set |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

---

### `tasks`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Task identifier |
| `title_ar` | `varchar(500)` | NOT NULL | Task title in Arabic |
| `title_en` | `varchar(500)` | NOT NULL | Task title in English |
| `description_ar` | `text` | NULL | Detailed description in Arabic |
| `description_en` | `text` | NULL | Detailed description in English |
| `status` | `task_status` | NOT NULL, default `'draft'` | Current workflow status |
| `assigned_to` | `uuid` | FK → `users.id`, NULL | Assignee (NULL when draft) |
| `assigned_by` | `uuid` | FK → `users.id`, NULL | Manager who assigned the task |
| `created_by` | `uuid` | FK → `users.id`, NOT NULL | Creator |
| `department_id` | `uuid` | FK → `departments.id`, NULL | Owning department |
| `sla_policy_id` | `uuid` | FK → `sla_policies.id`, NULL | Applied SLA policy |
| `due_date` | `timestamptz` | NOT NULL | Task deadline |
| `sla_started_at` | `timestamptz` | NULL | When SLA clock started (`Assigned` transition) |
| `sla_paused_at` | `timestamptz` | NULL | When SLA clock paused (`Under Review` transition) |
| `sla_total_paused_seconds` | `integer` | NOT NULL, default `0` | Cumulative paused duration |
| `is_overdue` | `boolean` | NOT NULL, default `false` | Set by SLA monitor cron job |
| `cancellation_reason` | `text` | NULL | Mandatory when status = `cancelled` |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `deleted_at` | `timestamptz` | NULL | Soft delete (cancelled tasks) |

---

### `task_evidence_requirements`

Junction table linking tasks to the evidence requirements they address.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `task_id` | `uuid` | FK → `tasks.id`, NOT NULL | — |
| `evidence_requirement_id` | `uuid` | FK → `evidence_requirements.id`, NOT NULL | — |

**PK:** (`task_id`, `evidence_requirement_id`)

---

### `task_comments`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Comment identifier |
| `task_id` | `uuid` | FK → `tasks.id`, NOT NULL | Parent task |
| `author_id` | `uuid` | FK → `users.id`, NOT NULL | Comment author |
| `body` | `text` | NOT NULL, CHECK (length ≥ 1) | Comment text |
| `is_system_comment` | `boolean` | NOT NULL, default `false` | Auto-generated (e.g., reassignment note) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `deleted_at` | `timestamptz` | NULL | Soft delete |

---

## 7. Evidence & Review Domain

### `evidence_submissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Submission identifier |
| `task_id` | `uuid` | FK → `tasks.id`, NOT NULL | Linked task |
| `evidence_requirement_id` | `uuid` | FK → `evidence_requirements.id`, NOT NULL | Linked evidence requirement |
| `submitted_by` | `uuid` | FK → `users.id`, NOT NULL | Submitter (conflict-of-interest check) |
| `version` | `smallint` | NOT NULL, default `1` | Version number within this requirement |
| `notes` | `text` | NULL | Submitter's explanatory notes |
| `is_active` | `boolean` | NOT NULL, default `true` | Only the latest submission per requirement is active |
| `submitted_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

---

### `evidence_files`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | File record identifier |
| `submission_id` | `uuid` | FK → `evidence_submissions.id`, NOT NULL | Parent submission |
| `original_filename` | `varchar(500)` | NOT NULL | Original file name (unsanitized, metadata only) |
| `sanitized_filename` | `varchar(500)` | NOT NULL | Sanitized file name |
| `storage_key` | `varchar(500)` | NOT NULL, UNIQUE | UUID-based MinIO object key |
| `mime_type` | `varchar(100)` | NOT NULL | MIME type (validated at upload) |
| `file_size_bytes` | `bigint` | NOT NULL, CHECK (> 0) | File size |
| `sha256_hash` | `varchar(64)` | NOT NULL | SHA-256 hash for duplicate detection |
| `virus_scan_status` | `virus_scan_status` | NOT NULL, default `'pending'` | ClamAV scan status |
| `virus_scan_completed_at` | `timestamptz` | NULL | Scan completion timestamp |
| `uploaded_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `deleted_at` | `timestamptz` | NULL | Soft delete |

---

### `review_decisions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Decision record identifier |
| `submission_id` | `uuid` | FK → `evidence_submissions.id`, NOT NULL | Reviewed submission |
| `reviewed_by` | `uuid` | FK → `users.id`, NOT NULL | Reviewer (≠ `submitted_by`) |
| `decision` | `review_decision_type` | NOT NULL | Outcome of the review |
| `comment` | `text` | NOT NULL, CHECK (length ≥ 10) | Mandatory justification |
| `is_active` | `boolean` | NOT NULL, default `true` | Only the latest decision per submission is active |
| `decided_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

**Constraint:** `CHECK (reviewed_by ≠ submission.submitted_by)` — enforced in application layer and as a DB trigger.

---

## 8. Notifications Domain

### `notifications`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Notification identifier |
| `user_id` | `uuid` | FK → `users.id`, NOT NULL | Recipient |
| `event_type` | `notification_event_type` | NOT NULL | Type of triggering event |
| `title_ar` | `varchar(500)` | NOT NULL | Notification title in Arabic |
| `title_en` | `varchar(500)` | NOT NULL | Notification title in English |
| `body_ar` | `text` | NOT NULL | Notification body in Arabic |
| `body_en` | `text` | NOT NULL | Notification body in English |
| `entity_type` | `varchar(100)` | NULL | Related entity type (e.g., `task`) |
| `entity_id` | `uuid` | NULL | Related entity ID |
| `is_read` | `boolean` | NOT NULL, default `false` | In-app read status |
| `read_at` | `timestamptz` | NULL | When the user read the notification |
| `email_sent` | `boolean` | NOT NULL, default `false` | Whether email was dispatched |
| `email_sent_at` | `timestamptz` | NULL | Email delivery timestamp |
| `email_failed` | `boolean` | NOT NULL, default `false` | Whether all retries failed |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

---

### `notification_preferences`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | `uuid` | FK → `users.id`, NOT NULL | — |
| `event_type` | `notification_event_type` | NOT NULL | — |
| `in_app_enabled` | `boolean` | NOT NULL, default `true` | — |
| `email_enabled` | `boolean` | NOT NULL, default `true` | — |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | — |

**PK:** (`user_id`, `event_type`)

**Note:** Mandatory events (`task_assigned`, `sla_breach_l1`, `sla_breach_l2`, `account_locked`) cannot be set to `false` by the user. This is enforced at the application layer.

---

## 9. SLA & Escalation Domain

### `escalation_events`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Event identifier |
| `task_id` | `uuid` | FK → `tasks.id`, NOT NULL | Breaching task |
| `level` | `escalation_level` | NOT NULL | Warning, L1, or L2 |
| `triggered_at` | `timestamptz` | NOT NULL, default `now()` | When the event was triggered |
| `notified_user_ids` | `uuid[]` | NOT NULL | Array of user IDs notified |

**Note:** No `deleted_at`. Escalation events are append-only and immutable.

---

### `public_holidays`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | — |
| `date` | `date` | NOT NULL, UNIQUE | Holiday date |
| `name_ar` | `varchar(200)` | NOT NULL | Holiday name in Arabic |
| `name_en` | `varchar(200)` | NOT NULL | Holiday name in English |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | — |

---

## 10. Reporting Domain

### `report_jobs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK | Job identifier |
| `requested_by` | `uuid` | FK → `users.id`, NOT NULL | Report requester |
| `report_type` | `varchar(100)` | NOT NULL | E.g., `compliance_progress`, `audit_trail` |
| `format` | `report_format` | NOT NULL | PDF or Excel |
| `language` | `language_preference` | NOT NULL | Report output language |
| `filters` | `jsonb` | NULL | Applied filters (date range, dept, hierarchy) |
| `status` | `report_status` | NOT NULL, default `'queued'` | Current job status |
| `storage_key` | `varchar(500)` | NULL | MinIO object key of generated file |
| `file_size_bytes` | `bigint` | NULL | Size of generated file |
| `error_message` | `text` | NULL | Error detail if status = `failed` |
| `queued_at` | `timestamptz` | NOT NULL, default `now()` | — |
| `started_at` | `timestamptz` | NULL | When processing began |
| `completed_at` | `timestamptz` | NULL | When generation finished |
| `expires_at` | `timestamptz` | NULL | Auto-purge date (queued_at + 30 days) |

---

## 11. Audit Domain

### `audit_logs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `bigserial` | PK | Auto-incrementing log entry ID |
| `user_id` | `uuid` | FK → `users.id`, NULL | Acting user (NULL for system actions) |
| `action` | `varchar(100)` | NOT NULL | Action type (e.g., `task.status_changed`, `user.deactivated`) |
| `entity_type` | `varchar(100)` | NOT NULL | Entity table name (e.g., `tasks`) |
| `entity_id` | `uuid` | NOT NULL | Primary key of the affected entity |
| `before_value` | `jsonb` | NULL | Full entity state before change (NULL for creates) |
| `after_value` | `jsonb` | NULL | Full entity state after change (NULL for deletes) |
| `metadata` | `jsonb` | NULL | Additional context (e.g., reason for change) |
| `ip_address` | `inet` | NULL | Client IP address |
| `user_agent` | `text` | NULL | Client user agent |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Immutable event timestamp |

**Critical:** No `UPDATE` or `DELETE` privileges granted on this table to any DB role.

---

### `dashboard_snapshots` *(Materialized View)*

Refreshed every 5 minutes by a scheduled job. Read-only; never written directly.

| Column | Type | Description |
|--------|------|-------------|
| `snapshot_at` | `timestamptz` | When this snapshot was taken |
| `total_evidence_requirements` | `integer` | Total active (non-archived) evidence requirements |
| `approved_evidence_requirements` | `integer` | Evidence requirements with `is_approved = true` |
| `overall_completion_pct` | `numeric(5,1)` | System-wide completion percentage |
| `total_tasks` | `integer` | Total non-deleted tasks |
| `open_tasks` | `integer` | Tasks not in terminal states |
| `overdue_tasks` | `integer` | Tasks with `is_overdue = true` |
| `pending_reviews` | `integer` | Submissions in `submitted` or `under_review` status |
| `perspective_summary` | `jsonb` | Array: `[{id, name_ar, name_en, completion_pct, completion_status}]` |

---

## 12. Key Indexes

```sql
-- Authentication
CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);

-- Task queries
CREATE INDEX idx_tasks_assigned_to ON tasks (assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_status ON tasks (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due_date ON tasks (due_date) WHERE deleted_at IS NULL AND is_overdue = false;
CREATE INDEX idx_tasks_department ON tasks (department_id) WHERE deleted_at IS NULL;

-- Evidence & Review
CREATE INDEX idx_evidence_submissions_task_id ON evidence_submissions (task_id);
CREATE INDEX idx_evidence_submissions_requirement_id ON evidence_submissions (evidence_requirement_id);
CREATE INDEX idx_evidence_files_submission_id ON evidence_files (submission_id);
CREATE INDEX idx_evidence_files_sha256 ON evidence_files (sha256_hash, submission_id);
CREATE INDEX idx_review_decisions_submission_id ON review_decisions (submission_id);

-- Hierarchy
CREATE INDEX idx_axes_perspective_id ON axes (perspective_id) WHERE archived_at IS NULL;
CREATE INDEX idx_standards_axis_id ON standards (axis_id) WHERE archived_at IS NULL;
CREATE INDEX idx_evidence_requirements_standard_id ON evidence_requirements (standard_id) WHERE archived_at IS NULL;

-- Notifications
CREATE INDEX idx_notifications_user_id_unread ON notifications (user_id, created_at DESC) WHERE is_read = false;

-- Audit Log
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);
```

---

## 13. Key Constraints & Triggers

```sql
-- Enforce reviewer ≠ submitter
CREATE OR REPLACE FUNCTION check_reviewer_not_submitter()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM evidence_submissions
    WHERE id = NEW.submission_id
      AND submitted_by = NEW.reviewed_by
  ) THEN
    RAISE EXCEPTION 'Reviewer cannot review their own submission';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_conflict_check
BEFORE INSERT ON review_decisions
FOR EACH ROW EXECUTE FUNCTION check_reviewer_not_submitter();

-- Recalculate standard completion on review decision change
CREATE OR REPLACE FUNCTION recalc_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_standard_id uuid;
  v_axis_id uuid;
  v_perspective_id uuid;
  v_total integer;
  v_approved integer;
  v_pct numeric(5,1);
BEGIN
  -- Get the standard for this evidence requirement
  SELECT er.standard_id INTO v_standard_id
  FROM evidence_submissions es
  JOIN evidence_requirements er ON er.id = es.evidence_requirement_id
  WHERE es.id = NEW.submission_id;

  -- Recalculate standard
  SELECT
    COUNT(*) FILTER (WHERE is_approved = true),
    COUNT(*)
  INTO v_approved, v_total
  FROM evidence_requirements
  WHERE standard_id = v_standard_id AND archived_at IS NULL;

  v_pct := CASE WHEN v_total = 0 THEN 0
                ELSE ROUND((v_approved::numeric / v_total) * 100, 1) END;

  UPDATE standards SET
    completion_pct = v_pct,
    completion_status = CASE
      WHEN v_pct = 0   THEN 'not_started'
      WHEN v_pct = 100 THEN 'completed'
      ELSE 'in_progress'
    END,
    updated_at = now()
  WHERE id = v_standard_id;

  -- Cascade to axis
  SELECT axis_id INTO v_axis_id FROM standards WHERE id = v_standard_id;
  UPDATE axes SET
    completion_pct = (
      SELECT ROUND(AVG(completion_pct), 1) FROM standards
      WHERE axis_id = v_axis_id AND archived_at IS NULL
    ),
    updated_at = now()
  WHERE id = v_axis_id;

  -- Cascade to perspective
  SELECT perspective_id INTO v_perspective_id FROM axes WHERE id = v_axis_id;
  UPDATE perspectives SET
    completion_pct = (
      SELECT ROUND(AVG(completion_pct), 1) FROM axes
      WHERE perspective_id = v_perspective_id AND archived_at IS NULL
    ),
    updated_at = now()
  WHERE id = v_perspective_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalc_completion
AFTER INSERT OR UPDATE OF is_active ON review_decisions
FOR EACH ROW EXECUTE FUNCTION recalc_completion();

-- Prevent DELETE/UPDATE on audit_logs (enforced at DB role level)
REVOKE UPDATE, DELETE ON audit_logs FROM app_user;

-- Enforce unique email (case-insensitive)
CREATE UNIQUE INDEX idx_users_email_unique ON users (LOWER(email)) WHERE deleted_at IS NULL;
```

---

*Document End*

---

**Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-09 | Senior Engineering Team | Initial data model; derived from codebase analysis and PRD requirements |
