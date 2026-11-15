-- Qiyas Phase 1 · deadlines policies and notifications (docs/phase1/07-notifications-and-escalation.md)

CREATE TABLE qiyas.user_preferences (
  user_id    UUID PRIMARY KEY REFERENCES public.users(id),
  language   TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en', 'ur')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per deadline type; durations in business days (BR-NTF-02).
CREATE TABLE qiyas.sla_policies (
  timer_kind                     TEXT PRIMARY KEY CHECK (timer_kind IN
                                   ('manager_assignment', 'implementation', 'clarification_response', 'extension_decision', 'review', 'posting')),
  duration_business_days         INTEGER CHECK (duration_business_days IS NULL OR duration_business_days >= 0),
  reminder_days                  INTEGER[] NOT NULL DEFAULT '{}',
  escalation_after_business_days INTEGER NOT NULL DEFAULT 0 CHECK (escalation_after_business_days >= 0),
  repeat_every_business_days     INTEGER CHECK (repeat_every_business_days IS NULL OR repeat_every_business_days > 0),
  oversight_group_code           TEXT,
  is_active                      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                     UUID REFERENCES public.users(id)
);

INSERT INTO qiyas.sla_policies (timer_kind, duration_business_days, reminder_days, escalation_after_business_days, repeat_every_business_days, oversight_group_code) VALUES
  ('manager_assignment',     2,    '{1}',     0, NULL, NULL),
  ('implementation',         NULL, '{5,2,1}', 0, 3,    NULL),   -- duration set per assignment by the consultant
  ('clarification_response', 3,    '{1}',     0, NULL, 'compliance_oversight'),
  ('extension_decision',     2,    '{1}',     0, NULL, 'compliance_oversight'),
  ('review',                 5,    '{2,1}',   0, NULL, 'compliance_oversight'),
  ('posting',                5,    '{2,1}',   0, NULL, 'compliance_oversight');

INSERT INTO qiyas.groups (code, name_ar, name_en)
VALUES ('compliance_oversight', 'متابعة الامتثال', 'Compliance Oversight')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE qiyas.notification_mutes (
  user_id    UUID NOT NULL REFERENCES public.users(id),
  event_code TEXT NOT NULL,
  channel    TEXT NOT NULL CHECK (channel IN ('in_app', 'email')),
  PRIMARY KEY (user_id, event_code, channel)
);

CREATE TABLE qiyas.notifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id),
  event_code            TEXT NOT NULL,
  entity_type           TEXT,
  entity_id             TEXT,
  payload               JSONB NOT NULL DEFAULT '{}',
  dedupe_key            TEXT NOT NULL UNIQUE,               -- makes every producer idempotent (N-6)
  show_in_app           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at               TIMESTAMPTZ,
  email_status          TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'dead', 'skipped')),
  email_attempts        INTEGER NOT NULL DEFAULT 0,
  email_next_attempt_at TIMESTAMPTZ,
  email_last_error      TEXT
);
CREATE INDEX ix_notifications_inbox ON qiyas.notifications (user_id, created_at DESC) WHERE show_in_app;
CREATE INDEX ix_notifications_unread ON qiyas.notifications (user_id) WHERE read_at IS NULL AND show_in_app;
CREATE INDEX ix_notifications_email ON qiyas.notifications (email_status, email_next_attempt_at) WHERE email_status IN ('pending', 'failed');

-- Last audit record turned into notifications (the dispatcher's position).
CREATE TABLE qiyas.notification_cursor (
  id             BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  last_audit_id  BIGINT NOT NULL DEFAULT 0
);
INSERT INTO qiyas.notification_cursor DEFAULT VALUES;
