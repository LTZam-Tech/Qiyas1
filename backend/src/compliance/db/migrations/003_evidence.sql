-- Qiyas Phase 1 · evidence, review and DGA submission (docs/phase1/05-erd.md area D, 06-evidence-bank.md)

CREATE TABLE qiyas.artifacts (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id                    UUID NOT NULL REFERENCES qiyas.evidence_banks(id),
  owner_id                   UUID NOT NULL REFERENCES public.users(id),
  department_id              UUID REFERENCES qiyas.departments(id),
  title                      TEXT NOT NULL CHECK (length(trim(title)) > 0),
  kind                       TEXT NOT NULL CHECK (kind IN ('file', 'screenshot', 'report', 'data_export', 'link', 'other')),
  description                TEXT,
  source_artifact_version_id UUID,                                   -- reuse lineage (BR-BNK-05)
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE qiyas.artifact_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id         UUID NOT NULL REFERENCES qiyas.artifacts(id),
  version_no          INTEGER NOT NULL CHECK (version_no >= 1),
  storage_key         TEXT,
  sha256              TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes          BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  mime_type           TEXT,
  original_filename   TEXT,
  external_url        TEXT,
  scan_status         TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'infected', 'error')),
  document_date       DATE,
  approving_authority TEXT,
  page_references     JSONB,
  uploaded_by         UUID NOT NULL REFERENCES public.users(id),
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (artifact_id, version_no),
  CHECK (storage_key IS NOT NULL OR external_url IS NOT NULL)
);
CREATE INDEX ix_versions_sha ON qiyas.artifact_versions (sha256);

ALTER TABLE qiyas.artifacts
  ADD CONSTRAINT fk_artifact_source FOREIGN KEY (source_artifact_version_id) REFERENCES qiyas.artifact_versions(id);

-- New artifacts and versions only go into an open bank (closed cycles are read-only)
CREATE FUNCTION qiyas.guard_open_bank() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bank_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'artifacts' THEN
    SELECT status INTO bank_status FROM qiyas.evidence_banks WHERE id = NEW.bank_id;
  ELSE
    SELECT b.status INTO bank_status FROM qiyas.artifacts a JOIN qiyas.evidence_banks b ON b.id = a.bank_id WHERE a.id = NEW.artifact_id;
  END IF;
  IF bank_status <> 'open' THEN
    RAISE EXCEPTION 'evidence bank is read-only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_artifacts_open_bank BEFORE INSERT ON qiyas.artifacts FOR EACH ROW EXECUTE FUNCTION qiyas.guard_open_bank();
CREATE TRIGGER trg_versions_open_bank BEFORE INSERT ON qiyas.artifact_versions FOR EACH ROW EXECUTE FUNCTION qiyas.guard_open_bank();

-- An artifact version mapped to one requirement (and optionally one proof item):
-- the unit of review and of DGA posting. Review and submission statuses are independent columns.
CREATE TABLE qiyas.evidence_links (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_version_id  UUID NOT NULL REFERENCES qiyas.artifact_versions(id),
  cycle_requirement_id UUID NOT NULL REFERENCES qiyas.cycle_requirements(id),
  proof_item_id        UUID REFERENCES qiyas.proof_items(id),
  task_id              UUID REFERENCES qiyas.tasks(id),
  review_status        TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN
                         ('draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'revoked', 'superseded')),
  submitted_by         UUID REFERENCES public.users(id),
  submitted_at         TIMESTAMPTZ,
  review_due_at        TIMESTAMPTZ,
  claimed_by           UUID REFERENCES public.users(id),
  claimed_at           TIMESTAMPTZ,
  submission_status    TEXT CHECK (submission_status IN ('not_posted', 'posted')),
  posted_at            TIMESTAMPTZ,
  posted_by            UUID REFERENCES public.users(id),
  dga_reference        TEXT,
  created_by           UUID NOT NULL REFERENCES public.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- only accepted evidence enters DGA submission; the flag is kept for history after revoke/supersede (BR-SUB-05)
  CHECK (submission_status IS NULL OR review_status IN ('accepted', 'revoked', 'superseded')),
  CHECK (review_status <> 'accepted' OR submission_status IS NOT NULL),
  CHECK ((submission_status = 'posted') = (posted_at IS NOT NULL))
);
CREATE UNIQUE INDEX ux_link_active ON qiyas.evidence_links
  (artifact_version_id, cycle_requirement_id, COALESCE(proof_item_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE review_status NOT IN ('withdrawn', 'rejected');
CREATE INDEX ix_links_requirement ON qiyas.evidence_links (cycle_requirement_id, review_status);
CREATE INDEX ix_links_queue ON qiyas.evidence_links (review_status, review_due_at);
CREATE INDEX ix_links_task ON qiyas.evidence_links (task_id);

CREATE TABLE qiyas.review_decisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_link_id  UUID NOT NULL REFERENCES qiyas.evidence_links(id),
  reviewer_id       UUID NOT NULL REFERENCES public.users(id),
  decision          TEXT NOT NULL CHECK (decision IN ('accept', 'reject', 'revoke')),
  comment           TEXT,
  checklist_results JSONB,
  at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (decision = 'accept' OR length(trim(coalesce(comment, ''))) >= CASE WHEN decision = 'reject' THEN 10 ELSE 3 END)
);

-- SoD-1 / D9: nobody decides on evidence they uploaded
CREATE FUNCTION qiyas.guard_self_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM qiyas.evidence_links l JOIN qiyas.artifact_versions v ON v.id = l.artifact_version_id
              WHERE l.id = NEW.evidence_link_id AND v.uploaded_by = NEW.reviewer_id) THEN
    RAISE EXCEPTION 'nobody reviews evidence they uploaded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_review_not_self BEFORE INSERT ON qiyas.review_decisions FOR EACH ROW EXECUTE FUNCTION qiyas.guard_self_review();
CREATE TRIGGER trg_review_append_only BEFORE UPDATE OR DELETE ON qiyas.review_decisions
  FOR EACH ROW EXECUTE FUNCTION qiyas.history_is_append_only();

CREATE TABLE qiyas.submission_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_link_id UUID NOT NULL REFERENCES qiyas.evidence_links(id),
  from_status      TEXT NOT NULL,
  to_status        TEXT NOT NULL,
  reason           TEXT,
  dga_reference    TEXT,
  actor_id         UUID NOT NULL REFERENCES public.users(id),
  at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_submission_events_append_only BEFORE UPDATE OR DELETE ON qiyas.submission_events
  FOR EACH ROW EXECUTE FUNCTION qiyas.history_is_append_only();

CREATE TABLE qiyas.submission_packages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id    UUID NOT NULL REFERENCES qiyas.measurement_cycles(id),
  prepared_by UUID NOT NULL REFERENCES public.users(id),
  title       TEXT NOT NULL,
  storage_key TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE qiyas.submission_package_items (
  package_id       UUID NOT NULL REFERENCES qiyas.submission_packages(id) ON DELETE CASCADE,
  evidence_link_id UUID NOT NULL REFERENCES qiyas.evidence_links(id),
  sort_order       INTEGER NOT NULL,
  PRIMARY KEY (package_id, evidence_link_id)
);
