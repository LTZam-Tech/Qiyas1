-- Qiyas security remediation B5 (finding C10): the consultant who accepted an evidence link never
-- records it as posted to DGA, nor reverts its posting (D-C10-1: SoD-5 binds per record across
-- role history, and covers posting and unposting).
--
-- Defense in depth behind evidence/submission.ts markPosted / markNotPosted.
--   * evidence_links: a change that newly records a posting (status becomes 'posted', or posted_by
--     changes while posted) is refused when posted_by made an 'accept' decision on that link, and
--     (SoD-4) when the link is not currently accepted. Rows that are only carried along (for
--     example a revoke of an already posted link keeps submission_status in its SET list) do not
--     fire, so historic rows are not re-judged.
--   * submission_events: an event (post or unpost) by an actor who accepted the link is refused.
-- Refusals use SQLSTATE 23514 (check_violation), which the API maps to 422.
--
-- Pre-deploy audit (historic rows stay; the triggers only judge new writes):
--   SELECT l.id, l.posted_by FROM qiyas.evidence_links l
--    WHERE l.submission_status = 'posted' AND EXISTS (SELECT 1 FROM qiyas.review_decisions d
--      WHERE d.evidence_link_id = l.id AND d.decision = 'accept' AND d.reviewer_id = l.posted_by);

CREATE FUNCTION qiyas.guard_poster_not_reviewer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  link_id UUID;
  actor   UUID;
BEGIN
  IF TG_TABLE_NAME = 'evidence_links' THEN
    IF NEW.review_status <> 'accepted' THEN
      RAISE EXCEPTION 'only accepted evidence can be marked as posted' USING ERRCODE = 'check_violation';
    END IF;
    link_id := NEW.id;
    actor := NEW.posted_by;
  ELSE
    link_id := NEW.evidence_link_id;
    actor := NEW.actor_id;
  END IF;
  IF EXISTS (SELECT 1 FROM qiyas.review_decisions d
              WHERE d.evidence_link_id = link_id AND d.decision = 'accept' AND d.reviewer_id = actor) THEN
    RAISE EXCEPTION 'the consultant who accepted this evidence cannot post it or revert its posting (SoD-5)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_links_poster_not_reviewer BEFORE UPDATE OF submission_status, posted_by ON qiyas.evidence_links
  FOR EACH ROW
  WHEN (NEW.submission_status = 'posted'
        AND (OLD.submission_status IS DISTINCT FROM 'posted' OR OLD.posted_by IS DISTINCT FROM NEW.posted_by))
  EXECUTE FUNCTION qiyas.guard_poster_not_reviewer();
CREATE TRIGGER trg_submission_events_poster_not_reviewer BEFORE INSERT ON qiyas.submission_events
  FOR EACH ROW EXECUTE FUNCTION qiyas.guard_poster_not_reviewer();
