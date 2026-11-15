-- Qiyas Phase 1 · foundation schema (docs/phase1/05-erd.md, areas A and B)
-- Lives in its own schema "qiyas"; legacy tables in "public" are untouched.
-- Identity and login keep using public.users.

CREATE SCHEMA IF NOT EXISTS qiyas;

-- ------------------------------------------------------------------ A · organization
CREATE TABLE qiyas.org_settings (
  id               BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),          -- single row
  name_ar          TEXT NOT NULL,
  name_en          TEXT NOT NULL,
  logo_key         TEXT,
  default_language TEXT NOT NULL DEFAULT 'ar' CHECK (default_language IN ('ar', 'en', 'ur')),
  utc_offset_minutes INTEGER NOT NULL DEFAULT 180,
  weekend_days     SMALLINT[] NOT NULL DEFAULT '{5,6}',
  file_rules       JSONB NOT NULL DEFAULT '{"maxFileMb": 50, "allowed": ["pdf","doc","docx","xls","xlsx","ppt","pptx","png","jpg","jpeg","csv","zip"]}',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID REFERENCES public.users(id)
);

CREATE TABLE qiyas.departments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  UUID REFERENCES qiyas.departments(id),
  code       TEXT NOT NULL UNIQUE,
  name_ar    TEXT NOT NULL,
  name_en    TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE qiyas.department_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES qiyas.departments(id),
  user_id       UUID NOT NULL REFERENCES public.users(id),
  membership    TEXT NOT NULL CHECK (membership IN ('manager', 'deputy', 'member')),
  valid_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES public.users(id),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
-- exactly one current manager per department (BR-ADM-02)
CREATE UNIQUE INDEX ux_department_one_manager
  ON qiyas.department_members (department_id) WHERE membership = 'manager' AND valid_to IS NULL;
CREATE UNIQUE INDEX ux_department_member_current
  ON qiyas.department_members (department_id, user_id) WHERE valid_to IS NULL;

CREATE TABLE qiyas.groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name_ar    TEXT NOT NULL,
  name_en    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id)
);

CREATE TABLE qiyas.group_members (
  group_id UUID NOT NULL REFERENCES qiyas.groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES public.users(id),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE qiyas.roles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code      TEXT NOT NULL UNIQUE,
  name_ar   TEXT NOT NULL,
  name_en   TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  department_scoped BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE qiyas.permissions (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE
);

CREATE TABLE qiyas.role_permissions (
  role_id       UUID NOT NULL REFERENCES qiyas.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES qiyas.permissions(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL CHECK (scope IN ('own', 'dept', 'accepted', 'all')),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE qiyas.role_grants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id       UUID NOT NULL REFERENCES qiyas.roles(id),
  user_id       UUID REFERENCES public.users(id),
  group_id      UUID REFERENCES qiyas.groups(id),
  department_id UUID REFERENCES qiyas.departments(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by    UUID REFERENCES public.users(id),
  revoked_at    TIMESTAMPTZ,
  revoked_by    UUID REFERENCES public.users(id),
  CHECK ((user_id IS NULL) <> (group_id IS NULL))
);
CREATE UNIQUE INDEX ux_role_grant_active
  ON qiyas.role_grants (role_id, COALESCE(user_id, group_id), COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;

-- SoD-5 / D3: nobody holds both QC and DSO, enforced in the database as well as the service.
CREATE FUNCTION qiyas.check_role_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  new_code TEXT;
  scoped   BOOLEAN;
BEGIN
  SELECT code, department_scoped INTO new_code, scoped FROM qiyas.roles WHERE id = NEW.role_id;
  IF scoped AND NEW.department_id IS NULL THEN
    RAISE EXCEPTION 'role % must be granted for a department', new_code USING ERRCODE = 'check_violation';
  END IF;
  IF NOT scoped AND NEW.department_id IS NOT NULL THEN
    RAISE EXCEPTION 'role % is organization-wide', new_code USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revoked_at IS NULL AND NEW.user_id IS NOT NULL AND new_code IN ('QC', 'DSO') AND EXISTS (
    SELECT 1 FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
     WHERE g.user_id = NEW.user_id AND g.revoked_at IS NULL AND g.id <> NEW.id
       AND r.code = CASE new_code WHEN 'QC' THEN 'DSO' ELSE 'QC' END
  ) THEN
    RAISE EXCEPTION 'Qiyas Consultant and DGA Submission Officer cannot be held by the same person'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_role_grant_check BEFORE INSERT OR UPDATE ON qiyas.role_grants
  FOR EACH ROW EXECUTE FUNCTION qiyas.check_role_grant();

-- ------------------------------------------------------------------ B · framework
CREATE TABLE qiyas.framework_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer        TEXT NOT NULL,
  document_code TEXT NOT NULL,
  version       TEXT NOT NULL,
  published_on  DATE NOT NULL,
  title_ar      TEXT NOT NULL,
  title_en      TEXT NOT NULL,
  title_ur      TEXT,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  source_file   JSONB NOT NULL,                        -- the imported file, kept verbatim
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_by   UUID REFERENCES public.users(id),
  UNIQUE (issuer, document_code, version)
);

CREATE TABLE qiyas.perspectives (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_version_id UUID NOT NULL REFERENCES qiyas.framework_versions(id),
  code                 TEXT NOT NULL,
  sort_order           INTEGER NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL, name_ur TEXT,
  UNIQUE (framework_version_id, code)
);

CREATE TABLE qiyas.axes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perspective_id UUID NOT NULL REFERENCES qiyas.perspectives(id),
  code           TEXT NOT NULL,
  sort_order     INTEGER NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL, name_ur TEXT
);

CREATE TABLE qiyas.standards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  axis_id    UUID NOT NULL REFERENCES qiyas.axes(id),
  code       TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL, title_ur TEXT,
  goal       JSONB,
  scope      JSONB,
  "references" JSONB
);

CREATE TABLE qiyas.requirements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id           UUID NOT NULL REFERENCES qiyas.standards(id),
  parent_requirement_id UUID REFERENCES qiyas.requirements(id),
  code                  TEXT NOT NULL,
  kind                  TEXT NOT NULL CHECK (kind IN ('sequential', 'alternative', 'step', 'single')),
  sort_order            INTEGER NOT NULL,
  text_ar TEXT NOT NULL, text_en TEXT NOT NULL, text_ur TEXT
);

CREATE TABLE qiyas.proof_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id   UUID NOT NULL REFERENCES qiyas.standards(id),
  code          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL,
  expected_kind TEXT NOT NULL,
  description_ar TEXT NOT NULL, description_en TEXT NOT NULL, description_ur TEXT
);

CREATE TABLE qiyas.requirement_proof_items (
  requirement_id UUID NOT NULL REFERENCES qiyas.requirements(id),
  proof_item_id  UUID NOT NULL REFERENCES qiyas.proof_items(id),
  PRIMARY KEY (requirement_id, proof_item_id)
);

CREATE TABLE qiyas.crosswalk (
  from_requirement_id UUID NOT NULL REFERENCES qiyas.requirements(id),
  to_requirement_id   UUID NOT NULL REFERENCES qiyas.requirements(id),
  relation            TEXT NOT NULL CHECK (relation IN ('same', 'changed', 'split', 'merged')),
  created_by          UUID REFERENCES public.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_requirement_id, to_requirement_id)
);

-- A framework version that a cycle uses is read-only (BR-FW-02).
CREATE FUNCTION qiyas.guard_framework_in_use() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND (NEW.source_file IS DISTINCT FROM OLD.source_file OR NEW.version IS DISTINCT FROM OLD.version) THEN
    RAISE EXCEPTION 'framework version % is in use and cannot be changed; import a new revision', OLD.version
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_framework_guard BEFORE UPDATE ON qiyas.framework_versions
  FOR EACH ROW EXECUTE FUNCTION qiyas.guard_framework_in_use();

-- ------------------------------------------------------------------ B · cycles
CREATE TABLE qiyas.measurement_cycles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_version_id UUID NOT NULL REFERENCES qiyas.framework_versions(id),
  year                 INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  name                 TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'closed', 'archived')),
  starts_on            DATE NOT NULL,
  ends_on              DATE NOT NULL,
  internal_target_on   DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           UUID REFERENCES public.users(id),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE qiyas.cycle_requirements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              UUID NOT NULL REFERENCES qiyas.measurement_cycles(id),
  requirement_id        UUID NOT NULL REFERENCES qiyas.requirements(id),
  is_applicable         BOOLEAN NOT NULL DEFAULT TRUE,
  not_applicable_reason TEXT,
  applicability_set_by  UUID REFERENCES public.users(id),
  applicability_set_at  TIMESTAMPTZ,
  readiness             TEXT NOT NULL DEFAULT 'not_started' CHECK (readiness IN ('not_applicable', 'not_started', 'in_progress', 'ready')),
  readiness_pct         NUMERIC(5, 1),
  UNIQUE (cycle_id, requirement_id),
  CHECK (is_applicable OR length(trim(coalesce(not_applicable_reason, ''))) >= 3)
);

-- One evidence bank per cycle (BR-BNK-01)
CREATE TABLE qiyas.evidence_banks (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL UNIQUE REFERENCES qiyas.measurement_cycles(id),
  name     TEXT NOT NULL,
  status   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'read_only'))
);

-- ------------------------------------------------------------------ calendar & audit
CREATE TABLE qiyas.work_calendar (
  day   DATE PRIMARY KEY,
  kind  TEXT NOT NULL CHECK (kind IN ('holiday', 'working_override')),
  label TEXT
);

CREATE TABLE qiyas.audit_log (
  id           BIGSERIAL PRIMARY KEY,
  actor_id     UUID REFERENCES public.users(id),
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  before_value JSONB,
  after_value  JSONB,
  reason       TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ix_audit_entity ON qiyas.audit_log (entity_type, entity_id, at);
CREATE INDEX ix_audit_actor ON qiyas.audit_log (actor_id, at);

-- BR-AUD-02: append-only for everyone, including administrators.
CREATE FUNCTION qiyas.audit_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON qiyas.audit_log
  FOR EACH ROW EXECUTE FUNCTION qiyas.audit_is_append_only();
CREATE TRIGGER trg_audit_no_truncate BEFORE TRUNCATE ON qiyas.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION qiyas.audit_is_append_only();
