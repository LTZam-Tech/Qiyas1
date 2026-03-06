CREATE OR REPLACE FUNCTION recalc_standard_completion(p_standard_id UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_weight_sum DECIMAL(12,4);
  v_weighted_sum DECIMAL(12,4);
  v_mandatory_total INTEGER;
  v_mandatory_approved INTEGER;
  v_approved_count INTEGER;
  v_total_count INTEGER;
  v_pct DECIMAL(5,2);
BEGIN
  SELECT
    COALESCE(SUM(er.weight), 0),
    COALESCE(SUM(er.weight * CASE WHEN er.review_status = 'approved' THEN 1 ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE er.is_required = TRUE),
    COUNT(*) FILTER (WHERE er.is_required = TRUE AND er.review_status = 'approved'),
    COUNT(*) FILTER (WHERE er.review_status = 'approved'),
    COUNT(*)
  INTO
    v_weight_sum,
    v_weighted_sum,
    v_mandatory_total,
    v_mandatory_approved,
    v_approved_count,
    v_total_count
  FROM evidence_requirements er
  WHERE er.standard_id = p_standard_id
    AND er.deleted_at IS NULL
    AND er.status = 'active';

  IF v_total_count = 0 THEN
    v_pct := 0;
  ELSIF v_weight_sum = 0 THEN
    v_pct := ROUND((v_approved_count::DECIMAL / NULLIF(v_total_count, 0)) * 100, 2);
  ELSE
    v_pct := ROUND((v_weighted_sum / v_weight_sum) * 100, 2);
  END IF;

  IF v_mandatory_total > 0 AND v_mandatory_approved < v_mandatory_total THEN
    v_pct := LEAST(v_pct, 99);
  END IF;

  UPDATE standards
  SET completion_pct = v_pct,
      completion_status = CASE
        WHEN v_pct = 100 THEN 'completed'
        WHEN v_pct = 0 THEN 'not_started'
        WHEN v_pct < 100 THEN 'partial'
        ELSE 'in_progress'
      END
  WHERE id = p_standard_id;

  RETURN v_pct;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalc_axis_completion(p_axis_id UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_weight_sum DECIMAL(12,4);
  v_weighted_sum DECIMAL(12,4);
  v_avg DECIMAL(5,2);
  v_pct DECIMAL(5,2);
BEGIN
  SELECT COALESCE(SUM(s.weight), 0), COALESCE(SUM(s.weight * s.completion_pct), 0), COALESCE(AVG(s.completion_pct), 0)
  INTO v_weight_sum, v_weighted_sum, v_avg
  FROM standards s
  WHERE s.axis_id = p_axis_id
    AND s.deleted_at IS NULL;

  IF v_weight_sum = 0 THEN
    v_pct := v_avg;
  ELSE
    v_pct := ROUND(v_weighted_sum / v_weight_sum, 2);
  END IF;

  UPDATE axes SET completion_pct = v_pct WHERE id = p_axis_id;
  RETURN v_pct;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalc_perspective_completion(p_perspective_id UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_weight_sum DECIMAL(12,4);
  v_weighted_sum DECIMAL(12,4);
  v_avg DECIMAL(5,2);
  v_pct DECIMAL(5,2);
BEGIN
  SELECT COALESCE(SUM(a.weight), 0), COALESCE(SUM(a.weight * a.completion_pct), 0), COALESCE(AVG(a.completion_pct), 0)
  INTO v_weight_sum, v_weighted_sum, v_avg
  FROM axes a
  WHERE a.perspective_id = p_perspective_id
    AND a.deleted_at IS NULL;

  IF v_weight_sum = 0 THEN
    v_pct := v_avg;
  ELSE
    v_pct := ROUND(v_weighted_sum / v_weight_sum, 2);
  END IF;

  UPDATE perspectives SET completion_pct = v_pct WHERE id = p_perspective_id;
  RETURN v_pct;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalc_global_completion()
RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_weight_sum DECIMAL(12,4);
  v_weighted_sum DECIMAL(12,4);
  v_pct DECIMAL(5,2);
BEGIN
  SELECT COALESCE(SUM(p.weight), 0), COALESCE(SUM(p.weight * p.completion_pct), 0)
  INTO v_weight_sum, v_weighted_sum
  FROM perspectives p
  WHERE p.deleted_at IS NULL
    AND p.status = 'active';

  IF v_weight_sum = 0 THEN
    v_pct := 0;
  ELSE
    v_pct := ROUND(v_weighted_sum / v_weight_sum, 2);
  END IF;

  RETURN v_pct;
END;
$$ LANGUAGE plpgsql;
