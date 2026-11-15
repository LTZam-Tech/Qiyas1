-- Qiyas Phase 1 · batch 6e: client branding comes from settings, not from the build (docs/phase1/09 §7)
ALTER TABLE qiyas.org_settings ADD COLUMN logo_mime_type TEXT;
ALTER TABLE qiyas.org_settings ADD CONSTRAINT org_settings_logo_type CHECK (logo_mime_type IS NULL OR logo_mime_type IN ('image/png', 'image/jpeg', 'image/webp'));
