-- Qiyas security remediation B6 (finding C17): deactivating or deleting an account ends its v2
-- access (D-C17-1, D-C17-5).
--
-- v1 deactivation (users.service updateUser status=inactive, deleteUser) only sets
-- public.users.is_active / deleted_at. This migration adds an AFTER UPDATE trigger on public.users
-- (approved exception to "legacy public schema untouched", D-C17-5). When an account goes from
-- active to inactive or deleted, in the same transaction it:
--   * revokes the person's active personal v2 role grants (revoked_by NULL: the system);
--   * removes the person's group memberships;
--   * returns the person's review claims to the shared queue (qiyas.release_review_claims, the
--     same statement as evidence/review.ts RELEASE_CLAIMS_SQL; links of closed or archived cycles
--     stay frozen, D-C5-2 (b));
--   * writes one audit row 'user.deactivated' listing what was revoked and removed.
-- Left in place for an administrator (D-C17-2, D-C17-3): department memberships (also of a
-- manager), task ownership, clarifications and extension requests. The services already ignore
-- an inactive manager or member (core/context.ts departmentManager / isDepartmentMember).
-- Reactivation restores nothing: roles and memberships are given again by an administrator.
-- Updates that leave the account active (a name change, a repeated status=active) do nothing.
--
-- Pre-deploy reconciliation (accounts deactivated before this migration are not cascaded; an
-- administrator resolves every row first):
--   SELECT g.id, g.user_id, r.code FROM qiyas.role_grants g JOIN qiyas.roles r ON r.id = g.role_id
--     JOIN public.users u ON u.id = g.user_id
--    WHERE g.revoked_at IS NULL AND (NOT u.is_active OR u.deleted_at IS NOT NULL);
--   SELECT gm.* FROM qiyas.group_members gm JOIN public.users u ON u.id = gm.user_id
--    WHERE NOT u.is_active OR u.deleted_at IS NOT NULL;
--   SELECT m.department_id, m.user_id, m.membership FROM qiyas.department_members m JOIN public.users u ON u.id = m.user_id
--    WHERE m.valid_to IS NULL AND (NOT u.is_active OR u.deleted_at IS NOT NULL);
--   SELECT t.id, t.current_owner_id FROM qiyas.tasks t JOIN public.users u ON u.id = t.current_owner_id
--    WHERE t.execution_status NOT IN ('completed', 'cancelled') AND (NOT u.is_active OR u.deleted_at IS NOT NULL);
--   SELECT l.id, l.claimed_by FROM qiyas.evidence_links l JOIN public.users u ON u.id = l.claimed_by
--    WHERE l.review_status = 'under_review' AND (NOT u.is_active OR u.deleted_at IS NOT NULL);
--
-- Rollback: remediation/rollback/NNN-rollback-of-011_drop_user_deactivation_cascade.sql

-- The real installation has both columns (v1 0001_init.sql); a bare identity table gets them here.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- C11 / D-C11-3 claim release (B5), as one function. Returns the number of released claims.
CREATE FUNCTION qiyas.release_review_claims(p_user UUID, p_at TIMESTAMPTZ, p_actor UUID, p_reason TEXT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE n INTEGER;
BEGIN
  WITH released AS (
      UPDATE qiyas.evidence_links l SET review_status = 'submitted', claimed_by = NULL, claimed_at = NULL
        FROM qiyas.cycle_requirements cr JOIN qiyas.measurement_cycles mc ON mc.id = cr.cycle_id
       WHERE l.claimed_by = p_user AND l.review_status = 'under_review' AND cr.id = l.cycle_requirement_id
         AND mc.status IN ('planning', 'active')
      RETURNING l.id)
  INSERT INTO qiyas.audit_log (actor_id, action, entity_type, entity_id, after_value, reason, at)
  SELECT p_actor, 'review.released', 'evidence_link', released.id::text, jsonb_build_object('releasedFrom', p_user), p_reason, p_at
    FROM released;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION qiyas.cascade_user_deactivation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_grants   JSONB;
  v_groups   JSONB;
  v_released INTEGER;
BEGIN
  WITH revoked AS (
      UPDATE qiyas.role_grants g SET revoked_at = NOW(), revoked_by = NULL
       WHERE g.user_id = NEW.id AND g.revoked_at IS NULL
      RETURNING g.id, g.role_id, g.department_id)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('grantId', revoked.id, 'role', r.code, 'departmentId', revoked.department_id)), '[]'::jsonb)
    INTO v_grants
    FROM revoked JOIN qiyas.roles r ON r.id = revoked.role_id;

  WITH removed AS (
      DELETE FROM qiyas.group_members gm WHERE gm.user_id = NEW.id RETURNING gm.group_id)
  SELECT COALESCE(jsonb_agg(gr.code), '[]'::jsonb) INTO v_groups
    FROM removed JOIN qiyas.groups gr ON gr.id = removed.group_id;

  v_released := qiyas.release_review_claims(NEW.id, NOW(), NULL, 'user deactivated');

  INSERT INTO qiyas.audit_log (actor_id, action, entity_type, entity_id, before_value, after_value, reason, at)
  VALUES (NULL, 'user.deactivated', 'user', NEW.id::text,
          jsonb_build_object('grants', v_grants, 'groups', v_groups),
          jsonb_build_object('isActive', NEW.is_active, 'deleted', NEW.deleted_at IS NOT NULL, 'releasedClaims', v_released),
          'account deactivated or deleted', NOW());
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_user_deactivation_cascade ON public.users;
CREATE TRIGGER trg_user_deactivation_cascade AFTER UPDATE OF is_active, deleted_at ON public.users
  FOR EACH ROW
  WHEN (OLD.is_active IS TRUE AND OLD.deleted_at IS NULL AND (NEW.is_active IS NOT TRUE OR NEW.deleted_at IS NOT NULL))
  EXECUTE FUNCTION qiyas.cascade_user_deactivation();
