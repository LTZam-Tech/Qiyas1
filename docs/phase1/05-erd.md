# 05 · Entity Relationship Diagram — Phase 1

[← Index](README.md)

One database per client installation (no tenant column). The model is split into five areas; keys shown are the important ones, not every column.

Conventions for every table: `id uuid`, `created_at`, `created_by`, `updated_at`, `updated_by`, soft delete `deleted_at` where records are user-facing. Bilingual text uses `*_ar` / `*_en` columns; UI-only languages (Urdu) come from the translation layer, while framework content can carry an optional `*_ur`.

## A · Organization and administration

```mermaid
erDiagram
    ORG_SETTINGS {
        string name_ar
        string name_en
        string logo_key
        string default_language
        json   file_rules
    }
    USERS {
        uuid id PK
        string email UK
        string name_ar
        string name_en
        string preferred_language
        bool   is_active
    }
    DEPARTMENTS {
        uuid id PK
        uuid parent_id FK
        string code UK
        string name_ar
        string name_en
        bool is_active
    }
    DEPARTMENT_MEMBERS {
        uuid department_id FK
        uuid user_id FK
        string membership "manager | deputy | member"
        date valid_from
        date valid_to
    }
    GROUPS {
        uuid id PK
        string code UK
        string name_ar
        string name_en
    }
    GROUP_MEMBERS {
        uuid group_id FK
        uuid user_id FK
    }
    ROLES {
        uuid id PK
        string code UK "QC DM EMP DSO EXE ADM or custom"
        bool is_system
    }
    PERMISSIONS {
        uuid id PK
        string code UK "module.action"
    }
    ROLE_PERMISSIONS {
        uuid role_id FK
        uuid permission_id FK
        string scope "own | dept | all"
    }
    ROLE_GRANTS {
        uuid id PK
        uuid role_id FK
        uuid user_id FK "or"
        uuid group_id FK "either user or group"
        uuid department_id FK "null = organization-wide"
    }
    DEPARTMENTS ||--o{ DEPARTMENTS : "parent of"
    DEPARTMENTS ||--o{ DEPARTMENT_MEMBERS : has
    USERS ||--o{ DEPARTMENT_MEMBERS : "belongs to"
    GROUPS ||--o{ GROUP_MEMBERS : has
    USERS ||--o{ GROUP_MEMBERS : "member of"
    ROLES ||--o{ ROLE_PERMISSIONS : grants
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "granted by"
    ROLES ||--o{ ROLE_GRANTS : "given via"
    USERS ||--o{ ROLE_GRANTS : holds
    GROUPS ||--o{ ROLE_GRANTS : holds
    DEPARTMENTS ||--o{ ROLE_GRANTS : scopes
```

Rule: each active department has exactly one member with `membership = manager` at any time (enforced by a partial unique index).

## B · Framework (versioned DGA content) and cycles

```mermaid
erDiagram
    FRAMEWORK_VERSIONS {
        uuid id PK
        string issuer "DGA"
        string document_code "DGA-1-2-1-111"
        string version "5.0"
        date   published_on
        string status "draft | active | retired"
    }
    PERSPECTIVES {
        uuid id PK
        uuid framework_version_id FK
        string code
        int    sort_order
    }
    AXES {
        uuid id PK
        uuid perspective_id FK
        string code "5.1"
    }
    STANDARDS {
        uuid id PK
        uuid axis_id FK
        string code "5.1.1"
        text   text_ar
        text   goal_ar
        json   references "decrees, circulars"
        json   scope "entity categories"
    }
    REQUIREMENTS {
        uuid id PK
        uuid standard_id FK
        string code
        string kind "sequential | alternative | step"
        uuid   parent_requirement_id FK "sub-conditions"
        int    sort_order
    }
    PROOF_ITEMS {
        uuid id PK
        uuid standard_id FK
        string code
        text   description_ar
        string expected_kind "document | report | plan | template | certificate | screenshot | link | other"
    }
    REQUIREMENT_PROOF_ITEMS {
        uuid requirement_id FK
        uuid proof_item_id FK
    }
    CROSSWALK {
        uuid from_requirement_id FK
        uuid to_requirement_id FK
        string relation "same | changed | split | merged"
    }
    MEASUREMENT_CYCLES {
        uuid id PK
        uuid framework_version_id FK
        int  year
        string name "Qiyas 2026 / v5.0"
        string status "planning | active | closed | archived"
        date starts_on
        date ends_on
    }
    CYCLE_REQUIREMENTS {
        uuid id PK
        uuid cycle_id FK
        uuid requirement_id FK
        bool is_applicable
        text not_applicable_reason
        string readiness "derived"
        numeric readiness_pct "derived cache"
    }
    FRAMEWORK_VERSIONS ||--o{ PERSPECTIVES : contains
    PERSPECTIVES ||--o{ AXES : contains
    AXES ||--o{ STANDARDS : contains
    STANDARDS ||--o{ REQUIREMENTS : "has"
    STANDARDS ||--o{ PROOF_ITEMS : "asks for"
    REQUIREMENTS ||--o{ REQUIREMENT_PROOF_ITEMS : "evidenced by"
    PROOF_ITEMS ||--o{ REQUIREMENT_PROOF_ITEMS : "evidences"
    REQUIREMENTS ||--o{ CROSSWALK : "maps to newer"
    FRAMEWORK_VERSIONS ||--o{ MEASUREMENT_CYCLES : "measured in"
    MEASUREMENT_CYCLES ||--o{ CYCLE_REQUIREMENTS : "scopes"
    REQUIREMENTS ||--o{ CYCLE_REQUIREMENTS : "instantiated as"
```

`CYCLE_REQUIREMENTS` is the anchor for all operational data: assignments, evidence links and readiness all point at a requirement **within a cycle**, so two cycles never share status.

## C · Work: assignments, tasks, clarifications, extensions, escalations

```mermaid
erDiagram
    ASSIGNMENTS {
        uuid id PK
        uuid cycle_id FK
        uuid department_id FK
        uuid assigned_by FK "QC"
        text instructions
        string priority
        string status "draft | published | closed | cancelled"
    }
    ASSIGNMENT_REQUIREMENTS {
        uuid assignment_id FK
        uuid cycle_requirement_id FK
    }
    TASKS {
        uuid id PK
        uuid assignment_id FK
        uuid department_id FK
        string execution_status "see 04 section 1"
        uuid original_assignee_id FK
        uuid current_owner_id FK
        timestamptz manager_due_at
        timestamptz original_due_at
        timestamptz current_due_at
        bool is_escalated
    }
    TASK_REQUIREMENTS {
        uuid task_id FK
        uuid cycle_requirement_id FK
    }
    TASK_OWNERSHIP_HISTORY {
        uuid id PK
        uuid task_id FK
        uuid from_user_id FK
        uuid to_user_id FK
        string reason_kind "assign | self_assign | reassign | escalation | rework_return"
        text note
    }
    CLARIFICATIONS {
        uuid id PK
        uuid task_id FK
        uuid cycle_requirement_id FK "optional"
        uuid proof_item_id FK "optional"
        uuid requested_by FK
        string status "open | answered | closed | cancelled"
        timestamptz response_due_at
    }
    CLARIFICATION_MESSAGES {
        uuid id PK
        uuid clarification_id FK
        uuid author_id FK
        string author_role "requester | QC | DM"
        text body
        json attachments
    }
    EXTENSION_REQUESTS {
        uuid id PK
        uuid task_id FK
        string level "employee_ask | formal"
        uuid parent_request_id FK "formal request created from an employee ask"
        uuid requested_by FK "EMP for ask, DM for formal"
        timestamptz requested_due_at
        text justification
        string status "ask: asked | forwarded | declined | cancelled, formal: pending | approved | rejected | withdrawn"
        uuid decided_by FK
        timestamptz approved_due_at
        text decision_reason
        timestamptz decision_due_at
    }
    DEADLINE_PAUSES {
        uuid id PK
        uuid task_id FK
        string reason "clarification | awaiting_review"
        uuid clarification_id FK "when reason is clarification"
        timestamptz paused_at
        timestamptz resumed_at
        int paused_business_minutes
    }
    ESCALATIONS {
        uuid id PK
        uuid task_id FK
        string kind "manual | automatic"
        text reason
        uuid from_owner_id FK
        uuid to_owner_id FK
        uuid sla_rule_id FK "automatic only"
        uuid escalated_by FK "manual only"
    }
    TASK_COMMENTS {
        uuid id PK
        uuid task_id FK
        uuid author_id FK
        text body
    }
    ASSIGNMENTS ||--o{ ASSIGNMENT_REQUIREMENTS : covers
    ASSIGNMENTS ||--o{ TASKS : "split into"
    TASKS ||--o{ TASK_REQUIREMENTS : covers
    TASKS ||--o{ TASK_OWNERSHIP_HISTORY : "owned over time"
    TASKS ||--o{ CLARIFICATIONS : raises
    CLARIFICATIONS ||--o{ CLARIFICATION_MESSAGES : contains
    TASKS ||--o{ EXTENSION_REQUESTS : requests
    TASKS ||--o{ ESCALATIONS : "escalated by"
    TASKS ||--o{ DEADLINE_PAUSES : "paused during"
    EXTENSION_REQUESTS ||--o{ EXTENSION_REQUESTS : "ask becomes formal"
    TASKS ||--o{ TASK_COMMENTS : has
```

## D · Evidence, review and submission

```mermaid
erDiagram
    EVIDENCE_BANKS {
        uuid id PK
        uuid cycle_id FK "1:1"
        string name "Evidence Bank - Qiyas 2026 / v5.0"
        string status "open | read_only"
    }
    ARTIFACTS {
        uuid id PK
        uuid bank_id FK
        uuid owner_id FK
        uuid department_id FK
        string title
        string kind "file | screenshot | report | data_export | link | other"
        uuid source_artifact_version_id FK "reuse lineage, nullable"
    }
    ARTIFACT_VERSIONS {
        uuid id PK
        uuid artifact_id FK
        int version_no
        string storage_key
        string sha256
        bigint size_bytes
        string mime_type
        string original_filename
        string external_url "for link evidence"
        string scan_status "pending | clean | infected | error"
        date   document_date
        string approving_authority
        json   page_references "requirement -> pages"
        uuid uploaded_by FK
    }
    EVIDENCE_LINKS {
        uuid id PK
        uuid artifact_version_id FK
        uuid cycle_requirement_id FK
        uuid proof_item_id FK "optional"
        uuid task_id FK "the work that produced it"
        string review_status "draft | submitted | under_review | accepted | rejected | withdrawn | revoked | superseded"
        uuid claimed_by FK "consultant currently reviewing, never the uploader"
        timestamptz submitted_at
        timestamptz review_due_at
        string submission_status "not_posted | posted, null until accepted"
        timestamptz posted_at
        uuid posted_by FK
        string dga_reference
    }
    REVIEW_DECISIONS {
        uuid id PK
        uuid evidence_link_id FK
        uuid reviewer_id FK
        string decision "accept | reject | revoke"
        text comment
        json checklist_results
    }
    REVIEW_CHECKLIST_ITEMS {
        uuid id PK
        uuid framework_version_id FK
        uuid proof_item_id FK "null = applies to all"
        text text_ar
    }
    SUBMISSION_EVENTS {
        uuid id PK
        uuid evidence_link_id FK
        string from_status
        string to_status
        text reason
        uuid actor_id FK
    }
    SUBMISSION_PACKAGES {
        uuid id PK
        uuid cycle_id FK
        uuid prepared_by FK "DSO"
        string title
        string storage_key "generated archive"
    }
    SUBMISSION_PACKAGE_ITEMS {
        uuid package_id FK
        uuid evidence_link_id FK
        int sort_order
    }
    EVIDENCE_BANKS ||--o{ ARTIFACTS : stores
    ARTIFACTS ||--o{ ARTIFACT_VERSIONS : "versioned as"
    ARTIFACT_VERSIONS ||--o{ ARTIFACTS : "reused as source of"
    ARTIFACT_VERSIONS ||--o{ EVIDENCE_LINKS : "linked via"
    EVIDENCE_LINKS ||--o{ REVIEW_DECISIONS : "decided by"
    EVIDENCE_LINKS ||--o{ SUBMISSION_EVENTS : "posting history"
    SUBMISSION_PACKAGES ||--o{ SUBMISSION_PACKAGE_ITEMS : contains
    EVIDENCE_LINKS ||--o{ SUBMISSION_PACKAGE_ITEMS : "packaged in"
```

`EVIDENCE_LINKS` carries **two independent status columns** (review, submission). The task's execution status lives only on `TASKS`. No table stores a combined status.

## E · Deadlines, notifications, audit

```mermaid
erDiagram
    WORK_CALENDAR {
        date day PK
        string kind "weekend | holiday | working_override"
        string label
    }
    SLA_POLICIES {
        uuid id PK
        string timer_kind UK "see 07"
        int duration_business_days
        json reminders "offsets before due"
        int escalation_after_business_days
        uuid escalation_group_id FK
        bool is_active
    }
    SLA_TIMERS {
        uuid id PK
        string timer_kind
        string entity_type "task | clarification | extension | evidence_link"
        uuid entity_id
        uuid responsible_user_id FK
        timestamptz due_at
        string state "running | paused | met | breached | cancelled"
        int reminders_sent
    }
    NOTIFICATION_RULES {
        uuid id PK
        string event_code
        json recipients "roles, owner, requester, groups"
        json channels "in_app, email"
        bool user_can_mute
    }
    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        string event_code
        json payload
        timestamptz read_at
    }
    AUDIT_LOG {
        bigint id PK
        uuid actor_id FK
        string action
        string entity_type
        uuid entity_id
        json before_value
        json after_value
        string ip_address
        timestamptz at
    }
    SLA_POLICIES ||--o{ SLA_TIMERS : governs
    NOTIFICATION_RULES ||--o{ NOTIFICATIONS : produces
```

`AUDIT_LOG` is append-only: the application database user has `INSERT` and `SELECT` only.

## Key integrity rules

| Rule | Enforcement |
|---|---|
| A task covers only requirements of its own assignment | FK + check in service layer |
| Task assignee is a member of the task's department or its manager | Service layer + trigger |
| One pending formal extension and one open employee ask per task | Partial unique indexes on `(task_id, level) WHERE status IN ('pending','asked')` |
| Nobody holds both `QC` and `DSO` (D3) | Check on role grant (service layer + trigger on `ROLE_GRANTS`) |
| `current_due_at` = `original_due_at` + paused business time; with an approved extension, the approved date + paused business time after the approval (`approved_extension_at`, BR-EXT-03) | Recomputed by the deadline service; every change audited |
| One manager per department | Partial unique index on `(department_id) WHERE membership = 'manager' AND valid_to IS NULL` |
| `submission_status` only set when `review_status = 'accepted'` (or kept for history after revoke/supersede) | Check constraint + service |
| Reviewer ≠ uploader (D9) | Service layer on claim and decision + check in `REVIEW_DECISIONS` insert |
| One active claim per queue item | `claimed_by` set atomically; released on decision, release or timeout |
| Artifact in bank of a closed cycle is read-only | Service layer on `EVIDENCE_BANKS.status` |
| Evidence link's requirement belongs to the bank's cycle | FK through `cycle_requirement_id` + check |
