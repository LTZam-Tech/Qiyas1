-- ========================================
-- TASK WORKFLOW + ORG STRUCTURE
-- Adds departments/units and task assignment workflow fields
-- ========================================

-- 1) Organization structure tables
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE,
  name_en VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  code VARCHAR(50) UNIQUE,
  name_en VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_departments_status ON departments(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_department ON units(department_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status) WHERE deleted_at IS NULL;

-- Seed minimal org structure for dropdowns (idempotent by code)
INSERT INTO departments (code, name_en, name_ar)
VALUES
  ('DPT-DT', 'Digital Transformation Department', 'إدارة التحول الرقمي'),
  ('DPT-QC', 'Quality & Compliance Department', 'إدارة الجودة والامتثال'),
  ('DPT-DA', 'Data & Analytics Department', 'إدارة البيانات والتحليلات')
ON CONFLICT (code) DO NOTHING;

INSERT INTO units (department_id, code, name_en, name_ar)
SELECT d.id, x.code, x.name_en, x.name_ar
FROM (
  VALUES
    ('DPT-DT', 'UNT-GOV', 'Digital Governance Unit', 'وحدة الحوكمة الرقمية'),
    ('DPT-DT', 'UNT-PMO', 'Digital PMO Unit', 'وحدة إدارة المشاريع الرقمية'),
    ('DPT-QC', 'UNT-EXEC', 'Execution Follow-up Unit', 'وحدة المتابعة والتنفيذ')
) AS x(dept_code, code, name_en, name_ar)
JOIN departments d ON d.code = x.dept_code
ON CONFLICT (code) DO NOTHING;

-- 2) Task workflow columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS perspective_id UUID REFERENCES perspectives(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS axis_id UUID REFERENCES axes(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS evidence_type VARCHAR(20);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS target_type VARCHAR(20);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS target_department_id UUID REFERENCES departments(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS target_unit_id UUID REFERENCES units(id);

-- Existing rows backfill perspective/axis from standard
UPDATE tasks t
SET axis_id = s.axis_id,
    perspective_id = a.perspective_id
FROM standards s
JOIN axes a ON a.id = s.axis_id
WHERE t.standard_id = s.id
  AND (t.axis_id IS NULL OR t.perspective_id IS NULL);

-- Existing rows backfill evidence type
UPDATE tasks
SET evidence_type = COALESCE(evidence_type, 'file')
WHERE evidence_type IS NULL;

-- Make evidence requirement optional in new workflow
ALTER TABLE tasks ALTER COLUMN evidence_requirement_id DROP NOT NULL;

-- Ensure constraints are present and idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tasks_evidence_type'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT chk_tasks_evidence_type
      CHECK (evidence_type IN ('file', 'screenshot'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tasks_target_type'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT chk_tasks_target_type
      CHECK (target_type IN ('department', 'unit'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tasks_target_mapping'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT chk_tasks_target_mapping
      CHECK (
        (target_type = 'department' AND target_department_id IS NOT NULL AND target_unit_id IS NULL)
        OR
        (target_type = 'unit' AND target_unit_id IS NOT NULL)
      );
  END IF;
END $$;

-- Normalize priority options to required set
UPDATE tasks SET priority = 'medium' WHERE priority = 'normal';

DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'tasks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%priority%';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT %I', c_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tasks_priority'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT chk_tasks_priority
      CHECK (priority IN ('critical', 'high', 'medium', 'low'));
  END IF;
END $$;

ALTER TABLE tasks ALTER COLUMN evidence_type SET NOT NULL;

-- Keep perspective/axis required for new and existing rows (after backfill)
ALTER TABLE tasks ALTER COLUMN perspective_id SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN axis_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_perspective ON tasks(perspective_id);
CREATE INDEX IF NOT EXISTS idx_tasks_axis ON tasks(axis_id);
CREATE INDEX IF NOT EXISTS idx_tasks_evidence_type ON tasks(evidence_type);
CREATE INDEX IF NOT EXISTS idx_tasks_target_department ON tasks(target_department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_target_unit ON tasks(target_unit_id);
