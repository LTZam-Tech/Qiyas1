-- Qiyas Phase 1 · batch 6b/6c: regulations library, version crosswalk files,
-- folder import and link suggestions (docs/phase1/06-evidence-bank.md BNK-5, BR-FW-05)

-- ------------------------------------------------------------------ regulations library
-- Laws, decisions, circulars, DGA controls, policies and guides. The release ships
-- metadata only ("catalogue"); each client uploads its own copy of the PDF.
CREATE TABLE qiyas.library_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL UNIQUE,
  kind              TEXT NOT NULL CHECK (kind IN ('law', 'regulation', 'royal_decree', 'royal_order', 'decision', 'circular', 'directive',
                                                  'controls', 'policy', 'guide', 'framework', 'user_guide', 'report', 'presentation', 'other')),
  origin            TEXT NOT NULL CHECK (origin IN ('catalogue', 'citation', 'client')),
  issuer            TEXT,
  version           TEXT,
  issued_on         TEXT,                                  -- as written (often Hijri, e.g. 26/1/1445هـ)
  title_ar          TEXT NOT NULL CHECK (length(trim(title_ar)) > 0),
  title_en          TEXT NOT NULL CHECK (length(trim(title_en)) > 0),
  title_ur          TEXT,
  description       JSONB,
  storage_key       TEXT,
  sha256            TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes        BIGINT,
  mime_type         TEXT,
  original_filename TEXT,
  file_uploaded_by  UUID REFERENCES public.users(id),
  file_uploaded_at  TIMESTAMPTZ,
  external_url      TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by        UUID REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- cited  = the standard names the document (its references or its text)
-- related = same topic, suggested by the catalogue
CREATE TABLE qiyas.library_document_standards (
  document_id UUID NOT NULL REFERENCES qiyas.library_documents(id) ON DELETE CASCADE,
  standard_id UUID NOT NULL REFERENCES qiyas.standards(id),
  relation    TEXT NOT NULL CHECK (relation IN ('cited', 'related')),
  detail      TEXT,                                        -- e.g. the clause cited
  PRIMARY KEY (document_id, standard_id)
);
CREATE INDEX ix_library_standard ON qiyas.library_document_standards (standard_id);

-- ------------------------------------------------------------------ crosswalk files
ALTER TABLE qiyas.crosswalk DROP CONSTRAINT crosswalk_relation_check;
ALTER TABLE qiyas.crosswalk ADD CONSTRAINT crosswalk_relation_check CHECK (relation IN ('same', 'changed', 'split', 'merged', 'moved'));

-- One crosswalk per pair of framework versions; the file is kept verbatim (notes, removed items)
CREATE TABLE qiyas.crosswalk_sets (
  from_framework_version_id UUID NOT NULL REFERENCES qiyas.framework_versions(id),
  to_framework_version_id   UUID NOT NULL REFERENCES qiyas.framework_versions(id),
  source_file               JSONB NOT NULL,
  imported_by               UUID REFERENCES public.users(id),
  imported_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_framework_version_id, to_framework_version_id),
  CHECK (from_framework_version_id <> to_framework_version_id)
);

-- ------------------------------------------------------------------ link suggestions
-- Evidence placed in the bank by a folder import or a carry-over, with the
-- requirement it probably proves. The task owner (or a consultant) confirms
-- each one, which creates a normal draft link (BNK-5).
CREATE TABLE qiyas.link_suggestions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_version_id  UUID NOT NULL REFERENCES qiyas.artifact_versions(id),
  cycle_requirement_id UUID NOT NULL REFERENCES qiyas.cycle_requirements(id),
  proof_item_id        UUID REFERENCES qiyas.proof_items(id),
  source               TEXT NOT NULL CHECK (source IN ('folder_import', 'carry_over')),
  source_detail        JSONB,
  status               TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'linked', 'dismissed')),
  evidence_link_id     UUID REFERENCES qiyas.evidence_links(id),
  decided_by           UUID REFERENCES public.users(id),
  decided_at           TIMESTAMPTZ,
  created_by           UUID NOT NULL REFERENCES public.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((status = 'open') = (decided_at IS NULL)),
  CHECK (status <> 'linked' OR evidence_link_id IS NOT NULL)
);
CREATE UNIQUE INDEX ux_suggestion_open ON qiyas.link_suggestions (artifact_version_id, cycle_requirement_id) WHERE status = 'open';
CREATE INDEX ix_suggestion_requirement ON qiyas.link_suggestions (cycle_requirement_id, status);

-- ------------------------------------------------------------------ folder import
CREATE TABLE qiyas.import_batches (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id                  UUID NOT NULL REFERENCES qiyas.measurement_cycles(id),
  label                     TEXT NOT NULL,
  -- the framework version the file names follow; another version is translated through the crosswalk
  codes_framework_version_id UUID NOT NULL REFERENCES qiyas.framework_versions(id),
  status                    TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'finished')),
  created_by                UUID NOT NULL REFERENCES public.users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at               TIMESTAMPTZ
);

CREATE TABLE qiyas.import_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            UUID NOT NULL REFERENCES qiyas.import_batches(id),
  relative_path       TEXT NOT NULL,
  size_bytes          BIGINT,
  detected_code       TEXT,
  outcome             TEXT NOT NULL CHECK (outcome IN ('suggested', 'unmatched', 'duplicate', 'skipped', 'rejected', 'quarantined')),
  artifact_version_id UUID REFERENCES qiyas.artifact_versions(id),
  suggestions         INTEGER NOT NULL DEFAULT 0,
  message             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, relative_path)
);
