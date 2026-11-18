-- Qiyas security remediation B4 (finding C5): a closed or archived measurement cycle is read-only.
--
-- Defense in depth behind the service guard core/cycleGuard.ts assertCycleWritable. Until an
-- administrator reopens the cycle with a reason (transitionCycle 'reopen'), the database refuses:
--   * new or changed evidence links (D-C5-1, D-C5-2 (b): in-flight links are frozen),
--   * review decisions, DGA posting events and submission packages (D-C5-1),
--   * any update of the cycle's requirements, which freezes readiness and applicability.
-- The refusal uses SQLSTATE 55000 (object_not_in_prerequisite_state), which the API maps to 409.
-- There is deliberately no session-variable bypass.
--
-- Not affected: transitionCycle itself (it writes measurement_cycles and evidence_banks only),
-- createCycle (INSERT into cycle_requirements of a new planning cycle), and carry-over from a
-- closed cycle (it reads the source and writes artifacts, versions and suggestions of the target).

CREATE FUNCTION qiyas.guard_cycle_writable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cycle_ids UUID[];
  cycle_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'cycle_requirements' THEN
    cycle_ids := ARRAY[NEW.cycle_id, OLD.cycle_id];
  ELSIF TG_TABLE_NAME = 'evidence_links' THEN
    IF TG_OP = 'UPDATE' THEN
      SELECT array_agg(cr.cycle_id) INTO cycle_ids FROM qiyas.cycle_requirements cr
       WHERE cr.id IN (NEW.cycle_requirement_id, OLD.cycle_requirement_id);
    ELSE
      SELECT array_agg(cr.cycle_id) INTO cycle_ids FROM qiyas.cycle_requirements cr WHERE cr.id = NEW.cycle_requirement_id;
    END IF;
  ELSIF TG_TABLE_NAME IN ('review_decisions', 'submission_events') THEN
    SELECT array_agg(cr.cycle_id) INTO cycle_ids FROM qiyas.evidence_links l
      JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id WHERE l.id = NEW.evidence_link_id;
  ELSIF TG_TABLE_NAME = 'submission_packages' THEN
    cycle_ids := ARRAY[NEW.cycle_id];
  ELSIF TG_TABLE_NAME = 'submission_package_items' THEN
    SELECT array_agg(x.cycle_id) INTO cycle_ids FROM (
      SELECT p.cycle_id FROM qiyas.submission_packages p WHERE p.id = NEW.package_id
      UNION ALL
      SELECT cr.cycle_id FROM qiyas.evidence_links l JOIN qiyas.cycle_requirements cr ON cr.id = l.cycle_requirement_id
       WHERE l.id = NEW.evidence_link_id) x;
  END IF;

  -- FOR SHARE conflicts with transitionCycle's FOR UPDATE, so a close cannot slip in between
  FOR cycle_status IN SELECT c.status FROM qiyas.measurement_cycles c WHERE c.id = ANY(cycle_ids) ORDER BY c.id FOR SHARE LOOP
    IF cycle_status NOT IN ('planning', 'active') THEN
      RAISE EXCEPTION 'the measurement cycle is %; it is read-only until an administrator reopens it', cycle_status
        USING ERRCODE = '55000';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_links_cycle_writable BEFORE INSERT OR UPDATE ON qiyas.evidence_links
  FOR EACH ROW EXECUTE FUNCTION qiyas.guard_cycle_writable();
CREATE TRIGGER trg_review_decisions_cycle_writable BEFORE INSERT ON qiyas.review_decisions
  FOR EACH ROW EXECUTE FUNCTION qiyas.guard_cycle_writable();
CREATE TRIGGER trg_submission_events_cycle_writable BEFORE INSERT ON qiyas.submission_events
  FOR EACH ROW EXECUTE FUNCTION qiyas.guard_cycle_writable();
CREATE TRIGGER trg_submission_packages_cycle_writable BEFORE INSERT ON qiyas.submission_packages
  FOR EACH ROW EXECUTE FUNCTION qiyas.guard_cycle_writable();
CREATE TRIGGER trg_submission_package_items_cycle_writable BEFORE INSERT ON qiyas.submission_package_items
  FOR EACH ROW EXECUTE FUNCTION qiyas.guard_cycle_writable();
CREATE TRIGGER trg_cycle_requirements_cycle_writable BEFORE UPDATE ON qiyas.cycle_requirements
  FOR EACH ROW EXECUTE FUNCTION qiyas.guard_cycle_writable();
