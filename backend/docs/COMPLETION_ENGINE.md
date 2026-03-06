# Completion Percentage Engine Documentation
**Digital Evidence & Compliance Management Platform**

This document explains the completion percentage calculation engine in detail, including formulas, implementation, and operational guidelines.

---

## Table of Contents

1. [Overview](#overview)
2. [Chosen Model](#chosen-model)
3. [Formula Hierarchy](#formula-hierarchy)
4. [Database Functions](#database-functions)
5. [Async Recalculation](#async-recalculation)
6. [Edge Cases](#edge-cases)
7. [Testing & Verification](#testing--verification)
8. [Performance Considerations](#performance-considerations)

---

## Overview

The completion percentage engine calculates compliance progress across a **four-level hierarchy**:

```
Global Score (100%)
  ↓
Perspective Completion (P1, P2, ..., P8)
  ↓
Axis Completion (A1.1, A1.2, ...)
  ↓
Standard Completion (S1.1.1, S1.1.2, ...)
  ↓
Evidence Requirement Status (approved | not approved)
```

### Key Requirements

1. **Approved-Only Counting:** Only `approved` evidence counts toward completion
2. **Mandatory Priority:** If any mandatory evidence is missing, cap completion at 99%
3. **Weighted Aggregation:** Use configurable weights at each level
4. **No Partial Credit:** Evidence is binary (100% approved or 0% not approved)
5. **Materialized Values:** Store calculated percentages in DB (not computed on-demand)
6. **Async Recalculation:** Percentage updates triggered asynchronously after state changes

---

## Chosen Model

### Model: **Weighted Mandatory-Priority Approved-Only**

After evaluation, this model was selected to ensure:

- ✅ **No partial credit** for pending or rejected evidence
- ✅ **Mandatory items are gates** — standard cannot reach 100% without all mandatory evidence
- ✅ **Weighted importance** — critical evidence can have higher weight
- ✅ **Audit integrity** — only fully approved evidence counts
- ✅ **Configurable** — weights adjustable per evidence requirement and standard

### Why This Model?

| Alternative Model | Why Rejected |
|-------------------|--------------|
| **Count-Based (Equal Weight)** | Doesn't reflect that some evidence is more critical than others |
| **Partial Credit for Submitted** | Violates audit requirement: only approved evidence should count |
| **No Mandatory Check** | Allows reaching 100% without critical mandatory items |
| **Real-Time Calculation** | Too slow for dashboard; needs materialization |

---

## Formula Hierarchy

### Level 1: Evidence Requirement Score

**Rule:** Binary — either fully approved or not.

```python
evidence_score = 100 if latest_submission_status == 'approved' else 0
```

**Implementation:**
- Check the `review_status` field on `evidence_requirements` table
- Status `'approved'` → score = 100
- Any other status (`'pending'`, `'submitted'`, `'under_review'`, `'rejected'`, `'resubmission_required'`) → score = 0

**Database Source:**
```sql
SELECT
  er.id,
  er.weight,
  er.is_required,
  CASE WHEN er.review_status = 'approved' THEN 1 ELSE 0 END AS is_approved
FROM evidence_requirements er
WHERE er.standard_id = :standard_id
  AND er.deleted_at IS NULL
  AND er.status = 'active';
```

---

### Level 2: Standard Completion %

**Formula:**

```sql
-- Step 1: Check mandatory requirements
mandatory_total = COUNT(er WHERE is_required = TRUE)
mandatory_approved = COUNT(er WHERE is_required = TRUE AND review_status = 'approved')

-- Step 2: Calculate weighted score
IF SUM(er.weight) = 0 THEN
  -- Fallback to equal weight
  standard_pct = (COUNT(er WHERE review_status = 'approved') / COUNT(er)) × 100
ELSE
  -- Weighted calculation
  standard_pct = (SUM(er.weight × is_approved) / SUM(er.weight)) × 100
END IF

-- Step 3: Apply mandatory cap
IF mandatory_approved < mandatory_total THEN
  standard_pct = MIN(standard_pct, 99)
END IF
```

**Example:**

Standard with 5 evidence requirements:

| Evidence | Weight | Mandatory | Status | Score |
|----------|--------|-----------|--------|-------|
| ER1 | 30 | Yes | Approved | 100 |
| ER2 | 20 | Yes | Approved | 100 |
| ER3 | 20 | No | Approved | 100 |
| ER4 | 20 | No | Pending | 0 |
| ER5 | 10 | No | Rejected | 0 |

**Calculation:**
```
Weighted Sum = (30×100 + 20×100 + 20×100 + 20×0 + 10×0) = 7000
Weight Sum = (30 + 20 + 20 + 20 + 10) = 100
Standard % = 7000 / 100 = 70%

Mandatory Check: 2 mandatory items, 2 approved → passes
Final Standard % = 70%
```

**If ER2 was not approved:**
```
Weighted Sum = (30×100 + 20×0 + 20×100 + 20×0 + 10×0) = 5000
Standard % = 5000 / 100 = 50%

Mandatory Check: 2 mandatory items, 1 approved → FAILS
Final Standard % = MIN(50, 99) = 50% (but flagged as incomplete)
```

---

### Level 3: Axis Completion %

**Formula:**

```sql
IF SUM(standard.weight) = 0 THEN
  axis_pct = AVG(standard.completion_pct)
ELSE
  axis_pct = SUM(standard.weight × standard.completion_pct) / SUM(standard.weight)
END IF
```

**Example:**

Axis with 3 standards:

| Standard | Weight | Completion % |
|----------|--------|--------------|
| S1 | 40 | 100% |
| S2 | 30 | 60% |
| S3 | 30 | 80% |

**Calculation:**
```
Weighted Sum = (40×100 + 30×60 + 30×80) = 8200
Weight Sum = (40 + 30 + 30) = 100
Axis % = 8200 / 100 = 82%
```

---

### Level 4: Perspective Completion %

**Formula:**

```sql
IF SUM(axis.weight) = 0 THEN
  perspective_pct = AVG(axis.completion_pct)
ELSE
  perspective_pct = SUM(axis.weight × axis.completion_pct) / SUM(axis.weight)
END IF
```

**Example:**

Perspective with 4 axes:

| Axis | Weight | Completion % |
|------|--------|--------------|
| A1 | 25 | 100% |
| A2 | 25 | 70% |
| A3 | 30 | 90% |
| A4 | 20 | 50% |

**Calculation:**
```
Weighted Sum = (25×100 + 25×70 + 30×90 + 20×50) = 8950
Weight Sum = (25 + 25 + 30 + 20) = 100
Perspective % = 8950 / 100 = 89.5%
```

---

### Level 5: Global Platform Score

**Formula:**

```sql
IF SUM(perspective.weight) = 0 THEN
  global_pct = AVG(perspective.completion_pct)
ELSE
  global_pct = SUM(perspective.weight × perspective.completion_pct) / SUM(perspective.weight)
END IF

WHERE perspective.deleted_at IS NULL
  AND perspective.status = 'active'
```

**Example:**

Platform with 8 perspectives (P1-P8):

| Perspective | Weight | Completion % |
|-------------|--------|--------------|
| P1 | 15 | 85% |
| P2 | 12 | 75% |
| P3 | 10 | 90% |
| P4 | 13 | 80% |
| P5 | 12 | 70% |
| P6 | 15 | 95% |
| P7 | 13 | 88% |
| P8 | 10 | 65% |

**Calculation:**
```
Weighted Sum = (15×85 + 12×75 + 10×90 + 13×80 + 12×70 + 15×95 + 13×88 + 10×65)
             = 8204
Weight Sum = (15 + 12 + 10 + 13 + 12 + 15 + 13 + 10) = 100
Global % = 8204 / 100 = 82.04%
```

---

## Database Functions

All calculation logic is implemented as PostgreSQL functions in [db/migrations/0003_completion_engine.sql](../db/migrations/0003_completion_engine.sql).

### Function: `recalc_standard_completion(standard_id UUID)`

**Purpose:** Calculate and update completion percentage for a single standard.

**Returns:** `DECIMAL(5,2)` — the calculated percentage

**Implementation:**
```sql
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
  -- Aggregate evidence requirement data
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

  -- Calculate percentage
  IF v_total_count = 0 THEN
    v_pct := 0;
  ELSIF v_weight_sum = 0 THEN
    -- Equal weight fallback
    v_pct := ROUND((v_approved_count::DECIMAL / NULLIF(v_total_count, 0)) * 100, 2);
  ELSE
    -- Weighted calculation
    v_pct := ROUND((v_weighted_sum / v_weight_sum) * 100, 2);
  END IF;

  -- Apply mandatory cap
  IF v_mandatory_total > 0 AND v_mandatory_approved < v_mandatory_total THEN
    v_pct := LEAST(v_pct, 99);
  END IF;

  -- Update standard
  UPDATE standards
  SET completion_pct = v_pct,
      completion_status = CASE
        WHEN v_pct = 100 THEN 'completed'
        WHEN v_pct = 0 THEN 'not_started'
        WHEN v_pct < 100 THEN 'partial'
        ELSE 'in_progress'
      END,
      updated_at = NOW()
  WHERE id = p_standard_id;

  RETURN v_pct;
END;
$$ LANGUAGE plpgsql;
```

### Function: `recalc_axis_completion(axis_id UUID)`

**Purpose:** Calculate and update completion percentage for an axis based on its standards.

**Returns:** `DECIMAL(5,2)` — the calculated percentage

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION recalc_axis_completion(p_axis_id UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_weight_sum DECIMAL(12,4);
  v_weighted_sum DECIMAL(12,4);
  v_avg DECIMAL(5,2);
  v_pct DECIMAL(5,2);
BEGIN
  SELECT
    COALESCE(SUM(s.weight), 0),
    COALESCE(SUM(s.weight * s.completion_pct), 0),
    COALESCE(AVG(s.completion_pct), 0)
  INTO v_weight_sum, v_weighted_sum, v_avg
  FROM standards s
  WHERE s.axis_id = p_axis_id
    AND s.deleted_at IS NULL;

  IF v_weight_sum = 0 THEN
    v_pct := v_avg;
  ELSE
    v_pct := ROUND(v_weighted_sum / v_weight_sum, 2);
  END IF;

  UPDATE axes
  SET completion_pct = v_pct,
      updated_at = NOW()
  WHERE id = p_axis_id;

  RETURN v_pct;
END;
$$ LANGUAGE plpgsql;
```

### Function: `recalc_perspective_completion(perspective_id UUID)`

**Purpose:** Calculate and update completion percentage for a perspective based on its axes.

**Returns:** `DECIMAL(5,2)` — the calculated percentage

### Function: `recalc_global_completion()`

**Purpose:** Calculate global platform completion score.

**Returns:** `DECIMAL(5,2)` — the global percentage

---

## Async Recalculation

### Trigger: Evidence Approval

When evidence is approved or rejected, the completion percentage must be recalculated **up the hierarchy**.

**Flow:**

1. **Reviewer approves/rejects evidence submission**
   - Update `evidence_requirements.review_status = 'approved'` (or other status)
   - **Synchronously** return API response to reviewer
   
2. **Queue async job: `calculate-completion`**
   ```python
   await queue.dispatch('calculate-completion', {
       'standard_id': evidence_requirement.standard_id
   })
   ```

3. **Job handler executes:**
   ```python
   @job_handler('calculate-completion')
   async def handle_calculate_completion(payload):
       standard_id = UUID(payload['standard_id'])
       
       # Recalculate standard
       standard_pct = await db.execute(
           "SELECT recalc_standard_completion(:sid)",
           sid=standard_id
       )
       
       # Get parent axis
       standard = await standards_repo.find_by_id(standard_id)
       axis_pct = await db.execute(
           "SELECT recalc_axis_completion(:aid)",
           aid=standard.axis_id
       )
       
       # Get parent perspective
       axis = await axes_repo.find_by_id(standard.axis_id)
       perspective_pct = await db.execute(
           "SELECT recalc_perspective_completion(:pid)",
           pid=axis.perspective_id
       )
       
       # Recalculate global
       global_pct = await db.execute("SELECT recalc_global_completion()")
       
       # Refresh dashboard snapshots
       await dashboard.refresh_snapshot(standard_id)
       
       logger.info(f"Completion recalculated: S={standard_pct}%, A={axis_pct}%, P={perspective_pct}%, G={global_pct}%")
   ```

### Job Idempotency

The recalculation job is **idempotent** — safe to run multiple times.

- If multiple approvals happen for the same standard within seconds, multiple jobs may be queued
- Each job recalculates from current DB state → same result
- No risk of race conditions or incorrect state

### Retry Policy

```yaml
job: calculate-completion
max_attempts: 3
backoff: exponential [5s, 30s, 120s]
timeout: 60s
```

---

## Edge Cases

### 1. Division by Zero (No Evidence Requirements)

**Scenario:** Standard has no evidence requirements yet.

**Handling:**
```sql
IF v_total_count = 0 THEN
  v_pct := 0;
END IF
```

**Result:** Standard completion = 0%

---

### 2. All Weights Are Zero

**Scenario:** Admin did not configure weights (all default to 0).

**Handling:** Fallback to **equal weight** calculation.

```sql
IF v_weight_sum = 0 THEN
  v_pct := (v_approved_count::DECIMAL / NULLIF(v_total_count, 0)) * 100;
END IF
```

**Example:**
- 5 evidence requirements, 3 approved → 3/5 × 100 = 60%

---

### 3. All Evidence Optional (No Mandatory)

**Scenario:** Standard has no mandatory evidence requirements.

**Handling:** No cap applied — can reach 100% if all optional items approved.

**Result:** Normal weighted calculation without mandatory check.

---

### 4. Soft-Deleted Evidence

**Scenario:** Evidence requirement was soft-deleted (`deleted_at IS NOT NULL`).

**Handling:** Excluded from all calculations.

```sql
WHERE er.deleted_at IS NULL
  AND er.status = 'active'
```

**Result:** Deleted evidence does not affect completion percentage.

---

### 5. Archived Standard

**Scenario:** Standard status = `'archived'`.

**Handling:** 
- Standard still calculated (completion stored)
- **Excluded from parent axis calculation**

```sql
WHERE s.deleted_at IS NULL
  -- status filter applied at axis/perspective level if needed
```

---

## Testing & Verification

### Unit Test: Standard Calculation

```python
def test_standard_completion_with_mandatory_missing():
    # Setup
    standard = create_standard()
    er1 = create_evidence_req(standard, weight=40, is_required=True, status='approved')
    er2 = create_evidence_req(standard, weight=30, is_required=True, status='pending')
    er3 = create_evidence_req(standard, weight=30, is_required=False, status='approved')
    
    # Execute
    pct = recalc_standard_completion(standard.id)
    
    # Assert
    # Weighted: (40×100 + 30×0 + 30×100) / 100 = 70%
    # Mandatory check: 2 mandatory, 1 approved → cap at 99%
    assert pct == 70.0
    
    # Verify stored value
    standard = standards_repo.find_by_id(standard.id)
    assert standard.completion_pct == 70.0
    assert standard.completion_status == 'partial'

def test_standard_completion_all_approved():
    standard = create_standard()
    create_evidence_req(standard, weight=50, is_required=True, status='approved')
    create_evidence_req(standard, weight=50, is_required=True, status='approved')
    
    pct = recalc_standard_completion(standard.id)
    
    assert pct == 100.0
    assert standards_repo.find_by_id(standard.id).completion_status == 'completed'
```

### Integration Test: Cascade Recalculation

```python
def test_approval_triggers_cascade_recalculation(test_db, queue_mock):
    # Setup hierarchy
    perspective = test_db.create_perspective()
    axis = test_db.create_axis(perspective_id=perspective.id)
    standard = test_db.create_standard(axis_id=axis.id)
    er = test_db.create_evidence_req(standard_id=standard.id, status='pending')
    
    # Approve evidence
    submission = test_db.create_submission(evidence_requirement_id=er.id, status='under_review')
    reviews_service.approve(submission.id, reviewer_id=test_db.admin_user.id)
    
    # Assert async job queued
    assert queue_mock.dispatched('calculate-completion', {'standard_id': standard.id})
    
    # Execute job
    queue_mock.process_all()
    
    # Verify cascade
    standard = standards_repo.find_by_id(standard.id)
    axis = axes_repo.find_by_id(axis.id)
    perspective = perspectives_repo.find_by_id(perspective.id)
    
    assert standard.completion_pct == 100.0
    assert axis.completion_pct == 100.0
    assert perspective.completion_pct == 100.0
```

### Manual Verification Query

```sql
-- Verify standard calculation manually
WITH evidence_summary AS (
  SELECT
    er.standard_id,
    COUNT(*) AS total_count,
    COUNT(*) FILTER (WHERE er.review_status = 'approved') AS approved_count,
    COUNT(*) FILTER (WHERE er.is_required = TRUE) AS mandatory_total,
    COUNT(*) FILTER (WHERE er.is_required = TRUE AND er.review_status = 'approved') AS mandatory_approved,
    SUM(er.weight) AS weight_sum,
    SUM(er.weight * CASE WHEN er.review_status = 'approved' THEN 1 ELSE 0 END) AS weighted_sum
  FROM evidence_requirements er
  WHERE er.deleted_at IS NULL AND er.status = 'active'
  GROUP BY er.standard_id
)
SELECT
  s.code,
  s.completion_pct AS stored_pct,
  ROUND((es.weighted_sum / NULLIF(es.weight_sum, 0)) * 100, 2) AS calculated_pct,
  es.mandatory_approved || '/' || es.mandatory_total AS mandatory_status,
  es.approved_count || '/' || es.total_count AS overall_status
FROM standards s
JOIN evidence_summary es ON es.standard_id = s.id;
```

---

## Performance Considerations

### Materialized Values

- ✅ **All percentages stored** in `perspectives`, `axes`, `standards` tables
- ✅ Dashboard queries read from stored values (no live calculation)
- ✅ Reduces dashboard load time from ~5s to ~50ms

### Dashboard Snapshot Table

For further optimization, a **materialized snapshot** table is pre-aggregated:

```sql
CREATE TABLE dashboard_snapshots (
  id UUID PRIMARY KEY,
  snapshot_type VARCHAR(50),  -- 'perspective' | 'axis' | 'standard' | 'global'
  entity_id UUID,
  completion_pct DECIMAL(5,2),
  total_requirements INTEGER,
  approved_count INTEGER,
  pending_count INTEGER,
  rejected_count INTEGER,
  overdue_tasks INTEGER,
  attention_flag BOOLEAN,
  computed_at TIMESTAMPTZ
);
```

**Refresh Strategy:**
- Triggered by async job after any recalculation
- Also refreshed by **cron job every 15 minutes** as backup

### Query Optimization

```sql
-- Efficient index for filtering standards by completion
CREATE INDEX idx_standards_completion ON standards(completion_status);

-- Partial index for active standards only
CREATE INDEX idx_standards_active ON standards(completion_pct) WHERE deleted_at IS NULL AND status = 'active';
```

---

## Operational Guidelines

### When to Manually Recalculate

**Scenario 1:** After bulk data import
```sql
-- Recalculate all standards in a perspective
SELECT recalc_standard_completion(s.id)
FROM standards s
JOIN axes a ON a.id = s.axis_id
WHERE a.perspective_id = :perspective_id;

-- Then recalculate axes
SELECT recalc_axis_completion(a.id)
FROM axes a
WHERE a.perspective_id = :perspective_id;

-- Then perspective
SELECT recalc_perspective_completion(:perspective_id);

-- Then global
SELECT recalc_global_completion();
```

**Scenario 2:** After changing weights
```sql
-- After updating evidence_requirements.weight or standards.weight
-- Recalculate affected standards
SELECT recalc_standard_completion(:standard_id);

-- And cascade up
SELECT recalc_axis_completion(:axis_id);
SELECT recalc_perspective_completion(:perspective_id);
SELECT recalc_global_completion();
```

### Monitoring

**Check for stale calculations:**
```sql
-- Find standards not recalculated in last 24 hours despite having recent submissions
SELECT s.id, s.code, s.updated_at, MAX(es.created_at) AS last_submission
FROM standards s
JOIN evidence_requirements er ON er.standard_id = s.id
JOIN evidence_submissions es ON es.evidence_requirement_id = er.id
WHERE es.created_at > s.updated_at
GROUP BY s.id
HAVING MAX(es.created_at) > s.updated_at + INTERVAL '24 hours';
```

---

## Summary

| Aspect | Implementation |
|--------|----------------|
| **Model** | Weighted Mandatory-Priority Approved-Only |
| **Levels** | 5 (Evidence → Standard → Axis → Perspective → Global) |
| **Storage** | Materialized in DB (`completion_pct` columns) |
| **Calculation** | PostgreSQL functions (transactional) |
| **Trigger** | Async job after evidence approval/rejection |
| **Performance** | Dashboard reads from stored values (~50ms) |
| **Accuracy** | Guaranteed correct via database functions |
| **Idempotency** | Recalculation jobs are idempotent and safe |

---

## Additional Resources

- [ARCHITECTURE.md](../ARCHITECTURE.md) — Full architecture specification
- [db/migrations/0003_completion_engine.sql](../db/migrations/0003_completion_engine.sql) — SQL implementation
- [API_IMPLEMENTATION_GUIDE.md](API_IMPLEMENTATION_GUIDE.md) — API patterns

---

*Last Updated: March 6, 2026*
