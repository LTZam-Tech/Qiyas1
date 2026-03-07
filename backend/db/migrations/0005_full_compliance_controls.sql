-- Full compliance controls: classification, legal hold, approvals, and access audit

-- 1) Evidence metadata hardening for compliance and records management
ALTER TABLE evidence_files
  ADD COLUMN IF NOT EXISTS data_classification VARCHAR(50) NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS confidentiality_level VARCHAR(30) NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS is_legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS legal_hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS legal_hold_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS signature_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evfiles_data_classification'
  ) THEN
    ALTER TABLE evidence_files
      ADD CONSTRAINT chk_evfiles_data_classification
      CHECK (data_classification IN ('public','internal','confidential','restricted'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evfiles_confidentiality_level'
  ) THEN
    ALTER TABLE evidence_files
      ADD CONSTRAINT chk_evfiles_confidentiality_level
      CHECK (confidentiality_level IN ('low','medium','high','critical'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evfiles_legal_hold_fields'
  ) THEN
    ALTER TABLE evidence_files
      ADD CONSTRAINT chk_evfiles_legal_hold_fields
      CHECK (
        (is_legal_hold = FALSE) OR
        (is_legal_hold = TRUE AND legal_hold_reason IS NOT NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_evfiles_classification ON evidence_files(data_classification);
CREATE INDEX IF NOT EXISTS idx_evfiles_confidentiality ON evidence_files(confidentiality_level);
CREATE INDEX IF NOT EXISTS idx_evfiles_legal_hold ON evidence_files(is_legal_hold) WHERE is_legal_hold = TRUE;
CREATE INDEX IF NOT EXISTS idx_evfiles_retention_until ON evidence_files(retention_until);

-- 1b) Classification for governance artifacts (standards and templates)
ALTER TABLE standards
  ADD COLUMN IF NOT EXISTS data_classification VARCHAR(50) NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS confidentiality_level VARCHAR(30) NOT NULL DEFAULT 'medium';

ALTER TABLE file_templates
  ADD COLUMN IF NOT EXISTS data_classification VARCHAR(50) NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS confidentiality_level VARCHAR(30) NOT NULL DEFAULT 'medium';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_standards_data_classification'
  ) THEN
    ALTER TABLE standards
      ADD CONSTRAINT chk_standards_data_classification
      CHECK (data_classification IN ('public','internal','confidential','restricted'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_standards_confidentiality_level'
  ) THEN
    ALTER TABLE standards
      ADD CONSTRAINT chk_standards_confidentiality_level
      CHECK (confidentiality_level IN ('low','medium','high','critical'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_templates_data_classification'
  ) THEN
    ALTER TABLE file_templates
      ADD CONSTRAINT chk_templates_data_classification
      CHECK (data_classification IN ('public','internal','confidential','restricted'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_templates_confidentiality_level'
  ) THEN
    ALTER TABLE file_templates
      ADD CONSTRAINT chk_templates_confidentiality_level
      CHECK (confidentiality_level IN ('low','medium','high','critical'));
  END IF;
END
$$;

-- 2) Policy matrix for approvals and separation of duties
CREATE TABLE IF NOT EXISTS approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  scope_type VARCHAR(30) NOT NULL
    CHECK (scope_type IN ('global','perspective','axis','standard')),
  perspective_id UUID REFERENCES perspectives(id),
  axis_id UUID REFERENCES axes(id),
  standard_id UUID REFERENCES standards(id),
  min_reviewer_count INTEGER NOT NULL DEFAULT 1 CHECK (min_reviewer_count > 0),
  required_reviewer_role VARCHAR(100),
  requires_reason_on_rejection BOOLEAN NOT NULL DEFAULT TRUE,
  enforce_segregation_duties BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_policies_scope ON approval_policies(scope_type, is_active);
CREATE INDEX IF NOT EXISTS idx_approval_policies_standard ON approval_policies(standard_id) WHERE standard_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_policies_axis ON approval_policies(axis_id) WHERE axis_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_approval_policies_perspective ON approval_policies(perspective_id) WHERE perspective_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_approval_policy_scope_fk'
  ) THEN
    ALTER TABLE approval_policies
      ADD CONSTRAINT chk_approval_policy_scope_fk
      CHECK (
        (scope_type = 'global' AND perspective_id IS NULL AND axis_id IS NULL AND standard_id IS NULL) OR
        (scope_type = 'perspective' AND perspective_id IS NOT NULL AND axis_id IS NULL AND standard_id IS NULL) OR
        (scope_type = 'axis' AND axis_id IS NOT NULL AND standard_id IS NULL) OR
        (scope_type = 'standard' AND standard_id IS NOT NULL)
      );
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_approval_policies_updated_at ON approval_policies;
CREATE TRIGGER trg_approval_policies_updated_at
BEFORE UPDATE ON approval_policies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3) Access audit for sensitive evidence operations
CREATE TABLE IF NOT EXISTS evidence_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_file_id UUID NOT NULL REFERENCES evidence_files(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES evidence_submissions(id),
  accessed_by UUID REFERENCES users(id),
  action VARCHAR(30) NOT NULL
    CHECK (action IN ('view','download','preview','share','delete_attempt')),
  access_granted BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT,
  source_ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ev_access_file ON evidence_access_logs(evidence_file_id);
CREATE INDEX IF NOT EXISTS idx_ev_access_user ON evidence_access_logs(accessed_by);
CREATE INDEX IF NOT EXISTS idx_ev_access_created ON evidence_access_logs(created_at DESC);

-- 4) Enforce segregation of duties: submitter cannot be same reviewer
CREATE OR REPLACE FUNCTION enforce_review_segregation_duties()
RETURNS TRIGGER AS $$
DECLARE
  v_submitter UUID;
BEGIN
  SELECT submitted_by INTO v_submitter
  FROM evidence_submissions
  WHERE id = NEW.submission_id;

  IF v_submitter IS NOT NULL AND v_submitter = NEW.reviewer_id THEN
    RAISE EXCEPTION 'Segregation of duties violation: submitter cannot review the same submission';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_review_decisions_sod ON review_decisions;
CREATE TRIGGER trg_review_decisions_sod
BEFORE INSERT OR UPDATE ON review_decisions
FOR EACH ROW EXECUTE FUNCTION enforce_review_segregation_duties();

-- 5) Prevent evidence deletion while under legal hold
CREATE OR REPLACE FUNCTION prevent_legal_hold_file_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_legal_hold = TRUE THEN
    RAISE EXCEPTION 'Evidence file is under legal hold and cannot be deleted';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_no_delete_legal_hold_file ON evidence_files;
CREATE TRIGGER trg_no_delete_legal_hold_file
BEFORE DELETE ON evidence_files
FOR EACH ROW EXECUTE FUNCTION prevent_legal_hold_file_delete();

-- 6) Baseline retention and legal-hold governance keys
INSERT INTO system_config (key, value, description, is_public)
VALUES
  ('retention.evidence_days', '2555'::jsonb, 'Retention period in days for evidence files (7 years)', FALSE),
  ('retention.audit_days', '2555'::jsonb, 'Retention period in days for audit logs (7 years)', FALSE),
  ('legal_hold.enabled', 'true'::jsonb, 'Enable legal hold controls on evidence data', FALSE)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();
