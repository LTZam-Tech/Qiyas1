-- Qiyas security remediation B5 (finding C9): SoD-5 (nobody holds both QC and DSO) is race-safe.
--
-- Before this migration check_role_grant used an unlocked EXISTS under READ COMMITTED, so two
-- transactions granting QC and DSO to the same person could both commit, and grants held through
-- groups were not considered at all. Changes to the 001 body:
--   * a transaction-level advisory lock per user, pg_advisory_xact_lock(7301, hashtext(user_id::text)),
--     is taken before the EXISTS whenever an active QC or DSO grant is written. admin.grantRole takes
--     the same lock before its own read, so the service still returns its clear validation message.
--     The function stays VOLATILE, so the EXISTS that runs after the lock sees rows committed meanwhile.
--   * the EXISTS also covers grants the user holds through groups (as core/context.ts loadActor does).
--   * D-C9-1: QC and DSO can no longer be granted to a group. Revoking a pre-existing group grant
--     stays possible.
-- New trigger on qiyas.group_members: adding a person to a group refuses the membership when the
-- person would then hold both QC and DSO (directly or through any group). It takes the same lock.
--
-- Pre-deploy data check (any row is a past race an administrator resolves first):
--   SELECT user_id FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
--    WHERE g.revoked_at IS NULL AND g.user_id IS NOT NULL AND r.code IN ('QC', 'DSO')
--    GROUP BY user_id HAVING count(DISTINCT r.code) = 2;
--   SELECT g.id FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
--    WHERE g.revoked_at IS NULL AND g.group_id IS NOT NULL AND r.code IN ('QC', 'DSO');

CREATE OR REPLACE FUNCTION qiyas.check_role_grant() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
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
  -- D-C9-1: QC and DSO are personal grants. A new or reactivated group grant is refused;
  -- revoking (or leaving unchanged) a grant that predates this rule is still allowed.
  IF NEW.revoked_at IS NULL AND NEW.group_id IS NOT NULL AND new_code IN ('QC', 'DSO')
     AND (TG_OP = 'INSERT' OR OLD.revoked_at IS NOT NULL OR OLD.role_id IS DISTINCT FROM NEW.role_id
          OR OLD.group_id IS DISTINCT FROM NEW.group_id) THEN
    RAISE EXCEPTION 'Qiyas Consultant and DGA Submission Officer cannot be granted to a group'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revoked_at IS NULL AND NEW.user_id IS NOT NULL AND new_code IN ('QC', 'DSO') THEN
    -- serializes every QC/DSO grant of this person (C9); released at commit or rollback
    PERFORM pg_advisory_xact_lock(7301, hashtext(NEW.user_id::text));
    IF EXISTS (
      SELECT 1 FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
       WHERE g.revoked_at IS NULL AND g.id <> NEW.id
         AND (g.user_id = NEW.user_id OR g.group_id IN (SELECT m.group_id FROM qiyas.group_members m WHERE m.user_id = NEW.user_id))
         AND r.code = CASE new_code WHEN 'QC' THEN 'DSO' ELSE 'QC' END
    ) THEN
      RAISE EXCEPTION 'Qiyas Consultant and DGA Submission Officer cannot be held by the same person'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- A person added to a group must not end up holding both QC and DSO (only possible through a
-- group grant that predates D-C9-1, but checked regardless).
CREATE FUNCTION qiyas.check_group_member_sod() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  codes TEXT[];
BEGIN
  PERFORM pg_advisory_xact_lock(7301, hashtext(NEW.user_id::text));
  SELECT array_agg(DISTINCT r.code) INTO codes
    FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
   WHERE g.revoked_at IS NULL AND r.code IN ('QC', 'DSO')
     AND (g.user_id = NEW.user_id
          OR g.group_id = NEW.group_id
          OR g.group_id IN (SELECT m.group_id FROM qiyas.group_members m WHERE m.user_id = NEW.user_id));
  IF codes @> ARRAY['QC', 'DSO'] THEN
    RAISE EXCEPTION 'Qiyas Consultant and DGA Submission Officer cannot be held by the same person'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_group_member_sod BEFORE INSERT OR UPDATE ON qiyas.group_members
  FOR EACH ROW EXECUTE FUNCTION qiyas.check_group_member_sod();
