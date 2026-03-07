CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone VARCHAR(50),
  department VARCHAR(255),
  job_title VARCHAR(255),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active) WHERE deleted_at IS NULL;

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  name_ar VARCHAR(100),
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) UNIQUE NOT NULL,
  module VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  description TEXT
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_info JSONB,
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

CREATE TABLE file_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(500) NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL,
  bucket VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE perspectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name_en VARCHAR(500) NOT NULL,
  name_ar VARCHAR(500) NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  weight DECIMAL(5,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  completion_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);
CREATE INDEX idx_perspectives_code ON perspectives(code);
CREATE INDEX idx_perspectives_status ON perspectives(status) WHERE deleted_at IS NULL;

CREATE TABLE axes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perspective_id UUID NOT NULL REFERENCES perspectives(id),
  code VARCHAR(30) NOT NULL UNIQUE,
  name_en VARCHAR(500) NOT NULL,
  name_ar VARCHAR(500) NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  weight DECIMAL(5,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  completion_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);
CREATE INDEX idx_axes_perspective ON axes(perspective_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_axes_code ON axes(code);

CREATE TABLE standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  axis_id UUID NOT NULL REFERENCES axes(id),
  code VARCHAR(30) NOT NULL UNIQUE,
  name_en VARCHAR(500) NOT NULL,
  name_ar VARCHAR(500) NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  weight DECIMAL(5,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','suspended')),
  completion_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  completion_status VARCHAR(50) NOT NULL DEFAULT 'not_started'
    CHECK (completion_status IN ('not_started','in_progress','partial','completed','attention')),
  owner_id UUID REFERENCES users(id),
  reviewer_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);
CREATE INDEX idx_standards_axis ON standards(axis_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_standards_code ON standards(code);
CREATE INDEX idx_standards_completion ON standards(completion_status);
CREATE INDEX idx_standards_owner ON standards(owner_id);

CREATE TABLE evidence_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id UUID NOT NULL REFERENCES standards(id),
  code VARCHAR(50),
  title_en VARCHAR(500) NOT NULL,
  title_ar VARCHAR(500) NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  weight DECIMAL(5,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  allowed_file_types TEXT[],
  max_file_size_mb INTEGER NOT NULL DEFAULT 25,
  max_files INTEGER NOT NULL DEFAULT 5,
  template_id UUID REFERENCES file_templates(id),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  review_status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','submitted','under_review','approved','rejected','resubmission_required')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);
CREATE INDEX idx_evreq_standard ON evidence_requirements(standard_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_evreq_review_status ON evidence_requirements(review_status);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_requirement_id UUID NOT NULL REFERENCES evidence_requirements(id),
  standard_id UUID NOT NULL REFERENCES standards(id),
  assigned_to UUID NOT NULL REFERENCES users(id),
  assigned_by UUID NOT NULL REFERENCES users(id),
  title VARCHAR(500) NOT NULL,
  instructions TEXT,
  due_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('draft','assigned','in_progress','submitted','under_review','approved','rejected','resubmission_required','closed','cancelled')),
  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  sla_breach_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_standard ON tasks(standard_id);
CREATE INDEX idx_tasks_status_deleted ON tasks(status, deleted_at);
CREATE INDEX idx_tasks_sla ON tasks(sla_breach_at) WHERE status NOT IN ('approved','closed','cancelled');

CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_task_comments_task ON task_comments(task_id);

CREATE TABLE evidence_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id),
  evidence_requirement_id UUID NOT NULL REFERENCES evidence_requirements(id),
  submitted_by UUID NOT NULL REFERENCES users(id),
  submission_number INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(50) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','rejected','resubmission_required')),
  notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_evsubmission_task ON evidence_submissions(task_id);
CREATE INDEX idx_evsubmission_req ON evidence_submissions(evidence_requirement_id);
CREATE INDEX idx_evsubmission_status ON evidence_submissions(status);
CREATE INDEX idx_evsubmission_reviewer ON evidence_submissions(reviewed_by);

CREATE TABLE evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES evidence_submissions(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  bucket VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_ext VARCHAR(20) NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  virus_scan_status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (virus_scan_status IN ('pending','clean','infected','error')),
  virus_scanned_at TIMESTAMPTZ,
  thumbnail_path TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_evfiles_submission ON evidence_files(submission_id);
CREATE INDEX idx_evfiles_uploaded_by ON evidence_files(uploaded_by);
CREATE INDEX idx_evfiles_virus ON evidence_files(virus_scan_status);
CREATE INDEX idx_evfiles_filename_fts ON evidence_files USING GIN (to_tsvector('simple', coalesce(original_filename, '')));

CREATE TABLE review_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES evidence_submissions(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved','rejected','resubmission_required')),
  reason TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_review_submission ON review_decisions(submission_id);
CREATE INDEX idx_review_reviewer ON review_decisions(reviewer_id);
CREATE INDEX idx_review_decision ON review_decisions(decision);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  body TEXT,
  data JSONB,
  channel VARCHAR(20) NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email','both')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications(type);

CREATE TABLE sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  hours_until_warning INTEGER NOT NULL,
  hours_until_breach INTEGER NOT NULL,
  applies_to_role VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_policy_id UUID NOT NULL REFERENCES sla_policies(id),
  escalation_level INTEGER NOT NULL,
  escalate_to_role VARCHAR(100),
  escalate_to_user_id UUID REFERENCES users(id),
  hours_after_breach INTEGER NOT NULL DEFAULT 0,
  notify_original BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE escalation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  submission_id UUID REFERENCES evidence_submissions(id),
  sla_policy_id UUID REFERENCES sla_policies(id),
  escalation_level INTEGER NOT NULL,
  escalated_to UUID REFERENCES users(id),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);
CREATE INDEX idx_escalation_task ON escalation_events(task_id);
CREATE INDEX idx_escalation_resolved ON escalation_events(resolved_at) WHERE resolved_at IS NULL;

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(200) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  before_value JSONB,
  after_value JSONB,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_created_brin ON audit_logs USING BRIN (created_at);

CREATE TABLE report_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type VARCHAR(100) NOT NULL,
  requested_by UUID NOT NULL REFERENCES users(id),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  filters JSONB,
  output_path TEXT,
  output_format VARCHAR(20) NOT NULL DEFAULT 'pdf' CHECK (output_format IN ('pdf','xlsx','zip')),
  file_size_bytes BIGINT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_report_jobs_user ON report_jobs(requested_by);
CREATE INDEX idx_report_jobs_status ON report_jobs(status);

CREATE TABLE system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dashboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type VARCHAR(50) NOT NULL CHECK (snapshot_type IN ('perspective','axis','standard','global')),
  entity_id UUID,
  completion_pct DECIMAL(5,2) NOT NULL,
  total_requirements INTEGER NOT NULL,
  approved_count INTEGER NOT NULL DEFAULT 0,
  pending_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  overdue_tasks INTEGER NOT NULL DEFAULT 0,
  attention_flag BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_snapshots_entity ON dashboard_snapshots(entity_id);
CREATE INDEX idx_snapshots_type ON dashboard_snapshots(snapshot_type);

CREATE MATERIALIZED VIEW dashboard_snapshot_mv AS
SELECT
  s.id AS standard_id,
  s.axis_id,
  a.perspective_id,
  s.completion_pct,
  COUNT(er.id) FILTER (WHERE er.deleted_at IS NULL) AS total_requirements,
  COUNT(er.id) FILTER (WHERE er.review_status = 'approved' AND er.deleted_at IS NULL) AS approved_count,
  COUNT(er.id) FILTER (WHERE er.review_status IN ('pending','submitted','under_review') AND er.deleted_at IS NULL) AS pending_count,
  COUNT(er.id) FILTER (WHERE er.review_status IN ('rejected','resubmission_required') AND er.deleted_at IS NULL) AS rejected_count
FROM standards s
JOIN axes a ON a.id = s.axis_id AND a.deleted_at IS NULL
LEFT JOIN evidence_requirements er ON er.standard_id = s.id
WHERE s.deleted_at IS NULL
GROUP BY s.id, s.axis_id, a.perspective_id, s.completion_pct;

CREATE UNIQUE INDEX idx_dashboard_snapshot_mv_standard ON dashboard_snapshot_mv(standard_id);

CREATE OR REPLACE FUNCTION validate_review_decision_reason()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.decision <> 'approved' AND (NEW.reason IS NULL OR btrim(NEW.reason) = '') THEN
    RAISE EXCEPTION 'Reason is mandatory for non-approved decisions';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_decisions_reason
BEFORE INSERT OR UPDATE ON review_decisions
FOR EACH ROW EXECUTE FUNCTION validate_review_decision_reason();

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_no_audit_update
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_perspectives_updated_at BEFORE UPDATE ON perspectives FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_axes_updated_at BEFORE UPDATE ON axes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_standards_updated_at BEFORE UPDATE ON standards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_evidence_requirements_updated_at BEFORE UPDATE ON evidence_requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_task_comments_updated_at BEFORE UPDATE ON task_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_evidence_submissions_updated_at BEFORE UPDATE ON evidence_submissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sla_policies_updated_at BEFORE UPDATE ON sla_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE perspectives
  ADD CONSTRAINT chk_perspectives_weight_range CHECK (weight >= 0 AND weight <= 100),
  ADD CONSTRAINT chk_perspectives_completion_range CHECK (completion_pct >= 0 AND completion_pct <= 100);

ALTER TABLE axes
  ADD CONSTRAINT chk_axes_weight_range CHECK (weight >= 0 AND weight <= 100),
  ADD CONSTRAINT chk_axes_completion_range CHECK (completion_pct >= 0 AND completion_pct <= 100);

ALTER TABLE standards
  ADD CONSTRAINT chk_standards_weight_range CHECK (weight >= 0 AND weight <= 100),
  ADD CONSTRAINT chk_standards_completion_range CHECK (completion_pct >= 0 AND completion_pct <= 100);

ALTER TABLE evidence_requirements
  ADD CONSTRAINT chk_evreq_weight_range CHECK (weight >= 0 AND weight <= 100),
  ADD CONSTRAINT chk_evreq_max_file_size CHECK (max_file_size_mb > 0),
  ADD CONSTRAINT chk_evreq_max_files CHECK (max_files > 0);

ALTER TABLE dashboard_snapshots
  ADD CONSTRAINT chk_dashboard_completion_range CHECK (completion_pct >= 0 AND completion_pct <= 100);
