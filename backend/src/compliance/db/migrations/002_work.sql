-- Qiyas Phase 1 · work schema (docs/phase1/05-erd.md, area C)
-- Assignments, tasks, ownership, deadline pauses, clarifications, extensions, escalations.

CREATE TABLE qiyas.assignments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES qiyas.measurement_cycles(id),
  department_id         UUID NOT NULL REFERENCES qiyas.departments(id),
  assigned_by           UUID NOT NULL REFERENCES public.users(id),
  title                 TEXT NOT NULL,
  instructions          TEXT,
  priority              TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed', 'cancelled')),
  implementation_due_at TIMESTAMPTZ NOT NULL,
  manager_due_at        TIMESTAMPTZ NOT NULL,
  cancel_reason         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at          TIMESTAMPTZ,
  CHECK (manager_due_at <= implementation_due_at)
);

CREATE TABLE qiyas.assignment_requirements (
  assignment_id        UUID NOT NULL REFERENCES qiyas.assignments(id) ON DELETE CASCADE,
  cycle_requirement_id UUID NOT NULL REFERENCES qiyas.cycle_requirements(id),
  PRIMARY KEY (assignment_id, cycle_requirement_id)
);

CREATE TABLE qiyas.tasks (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id             UUID NOT NULL REFERENCES qiyas.assignments(id),
  cycle_id                  UUID NOT NULL REFERENCES qiyas.measurement_cycles(id),
  department_id             UUID NOT NULL REFERENCES qiyas.departments(id),
  title                     TEXT NOT NULL,
  execution_status          TEXT NOT NULL DEFAULT 'draft' CHECK (execution_status IN
                              ('draft', 'awaiting_assignment', 'assigned', 'in_progress', 'submitted', 'rework_required', 'completed', 'cancelled')),
  original_assignee_id      UUID REFERENCES public.users(id),        -- set once, never changed (BR-ASG-05)
  current_owner_id          UUID NOT NULL REFERENCES public.users(id),
  manager_due_at            TIMESTAMPTZ NOT NULL,
  original_due_at           TIMESTAMPTZ NOT NULL,                     -- never changed (BR-EXT-04)
  approved_extension_due_at TIMESTAMPTZ,
  is_escalated              BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason             TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_tasks_owner ON qiyas.tasks (current_owner_id) WHERE execution_status NOT IN ('completed', 'cancelled');
CREATE INDEX ix_tasks_department ON qiyas.tasks (department_id, execution_status);

-- original_assignee_id is write-once
CREATE FUNCTION qiyas.guard_original_assignee() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.original_assignee_id IS NOT NULL AND NEW.original_assignee_id IS DISTINCT FROM OLD.original_assignee_id THEN
    RAISE EXCEPTION 'original assignee cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.original_due_at IS DISTINCT FROM OLD.original_due_at THEN
    RAISE EXCEPTION 'original deadline cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_task_guard BEFORE UPDATE ON qiyas.tasks FOR EACH ROW EXECUTE FUNCTION qiyas.guard_original_assignee();

CREATE TABLE qiyas.task_requirements (
  task_id              UUID NOT NULL REFERENCES qiyas.tasks(id) ON DELETE CASCADE,
  cycle_requirement_id UUID NOT NULL REFERENCES qiyas.cycle_requirements(id),
  PRIMARY KEY (task_id, cycle_requirement_id)
);

CREATE TABLE qiyas.task_ownership_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES qiyas.tasks(id),
  from_user_id UUID REFERENCES public.users(id),
  to_user_id   UUID NOT NULL REFERENCES public.users(id),
  reason_kind  TEXT NOT NULL CHECK (reason_kind IN ('publish', 'assign', 'self_assign', 'reassign', 'escalation', 'rework_return')),
  note         TEXT,
  actor_id     UUID REFERENCES public.users(id),
  at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_ownership_task ON qiyas.task_ownership_history (task_id, at);

CREATE TABLE qiyas.clarifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id              UUID NOT NULL REFERENCES qiyas.tasks(id),
  cycle_requirement_id UUID REFERENCES qiyas.cycle_requirements(id),
  proof_item_id        UUID REFERENCES qiyas.proof_items(id),
  requested_by         UUID NOT NULL REFERENCES public.users(id),
  requester_role       TEXT NOT NULL CHECK (requester_role IN ('EMP', 'DM')),
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed', 'cancelled')),
  response_due_at      TIMESTAMPTZ NOT NULL,
  answered_by          UUID REFERENCES public.users(id),
  answered_by_role     TEXT CHECK (answered_by_role IN ('QC', 'DM')),
  answered_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_clarifications_open ON qiyas.clarifications (status, response_due_at);

CREATE TABLE qiyas.clarification_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clarification_id UUID NOT NULL REFERENCES qiyas.clarifications(id),
  author_id        UUID NOT NULL REFERENCES public.users(id),
  author_role      TEXT NOT NULL CHECK (author_role IN ('requester', 'QC', 'DM')),
  body             TEXT NOT NULL CHECK (length(trim(body)) > 0),
  attachments      JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Implementation deadline pauses (D1 clarification, D5 awaiting review)
CREATE TABLE qiyas.deadline_pauses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID NOT NULL REFERENCES qiyas.tasks(id),
  reason           TEXT NOT NULL CHECK (reason IN ('clarification', 'awaiting_review')),
  clarification_id UUID REFERENCES qiyas.clarifications(id),
  paused_at        TIMESTAMPTZ NOT NULL,
  resumed_at       TIMESTAMPTZ,
  CHECK (resumed_at IS NULL OR resumed_at >= paused_at),
  CHECK ((reason = 'clarification') = (clarification_id IS NOT NULL))
);
-- at most one open pause per clarification, and one open review pause per task
CREATE UNIQUE INDEX ux_pause_open_clarification ON qiyas.deadline_pauses (clarification_id) WHERE resumed_at IS NULL AND clarification_id IS NOT NULL;
CREATE UNIQUE INDEX ux_pause_open_review ON qiyas.deadline_pauses (task_id) WHERE resumed_at IS NULL AND reason = 'awaiting_review';

CREATE TABLE qiyas.extension_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID NOT NULL REFERENCES qiyas.tasks(id),
  level             TEXT NOT NULL CHECK (level IN ('employee_ask', 'formal')),
  parent_request_id UUID REFERENCES qiyas.extension_requests(id),
  requested_by      UUID NOT NULL REFERENCES public.users(id),
  requested_due_at  TIMESTAMPTZ NOT NULL,
  justification     TEXT NOT NULL CHECK (length(trim(justification)) >= 3),
  status            TEXT NOT NULL,
  decided_by        UUID REFERENCES public.users(id),
  decided_at        TIMESTAMPTZ,
  approved_due_at   TIMESTAMPTZ,
  decision_reason   TEXT,
  decision_due_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((level = 'employee_ask' AND status IN ('asked', 'forwarded', 'declined', 'cancelled'))
      OR (level = 'formal' AND status IN ('pending', 'approved', 'rejected', 'withdrawn'))),
  CHECK (status <> 'approved' OR approved_due_at IS NOT NULL),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)          -- SoD-2
);
-- one open employee ask and one pending formal request per task (BR-EXT-05)
CREATE UNIQUE INDEX ux_extension_open ON qiyas.extension_requests (task_id, level) WHERE status IN ('asked', 'pending');

CREATE TABLE qiyas.escalations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES qiyas.tasks(id),
  kind            TEXT NOT NULL CHECK (kind IN ('manual', 'automatic')),
  reason          TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
  from_owner_id   UUID NOT NULL REFERENCES public.users(id),
  to_owner_id     UUID NOT NULL REFERENCES public.users(id),
  self_escalation BOOLEAN NOT NULL,                                  -- D2: owner was already the manager
  escalated_by    UUID REFERENCES public.users(id),
  due_at_snapshot TIMESTAMPTZ,
  at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((kind = 'manual') = (escalated_by IS NOT NULL)),
  CHECK (self_escalation = (from_owner_id = to_owner_id))
);
-- at most one automatic escalation per deadline (re-armed by a new deadline)
CREATE UNIQUE INDEX ux_auto_escalation_per_deadline ON qiyas.escalations (task_id, due_at_snapshot) WHERE kind = 'automatic';

-- History tables are never edited or deleted (BR-ESC-07)
CREATE FUNCTION qiyas.history_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only history', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER trg_escalations_append_only BEFORE UPDATE OR DELETE ON qiyas.escalations
  FOR EACH ROW EXECUTE FUNCTION qiyas.history_is_append_only();
CREATE TRIGGER trg_ownership_append_only BEFORE UPDATE OR DELETE ON qiyas.task_ownership_history
  FOR EACH ROW EXECUTE FUNCTION qiyas.history_is_append_only();

CREATE TABLE qiyas.task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES qiyas.tasks(id),
  author_id  UUID NOT NULL REFERENCES public.users(id),
  body       TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
