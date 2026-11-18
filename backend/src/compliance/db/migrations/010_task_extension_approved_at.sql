-- Qiyas security remediation B6 (finding C12): an approved extension date is final at approval
-- (BR-EXT-03, D-C12-1). Only pause time after the approval moves it later.
--
-- The deadline engine (domain/deadline.ts) clips each pause to start no earlier than
-- tasks.approved_extension_at. work/extensions.ts approveExtension sets the column together with
-- approved_extension_due_at.
--
-- D-C12-2 (new approvals only): there is deliberately NO backfill. Tasks approved before this
-- migration keep approved_extension_at NULL and therefore the previous rule (approved date + every
-- pause), so no deadline moves earlier on deploy and no reminder, overdue notice or automatic
-- escalation is triggered by the deploy itself.
--
-- No CHECK constraint: a CHECK (even NOT VALID) is re-evaluated on every later UPDATE of a row,
-- so it would refuse ordinary updates (ownership, status) of tasks approved before this migration.
--
-- Rollback: remediation/rollback/NNN-rollback-of-010_drop_task_extension_approved_at.sql

ALTER TABLE qiyas.tasks ADD COLUMN approved_extension_at TIMESTAMPTZ;

COMMENT ON COLUMN qiyas.tasks.approved_extension_at IS
  'When approved_extension_due_at was approved (C12). NULL for approvals before migration 010: those keep the old rule.';
