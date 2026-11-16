import { BaseRepository } from '@/db/repository';
import db from '@/db';
import { NotFoundError, ForbiddenError } from '@/utils/errors';

interface ReviewDecision {
  id: number;
  submission_id: number;
  reviewer_id: number;
  decision: string;
  feedback: string;
  reviewed_at: Date;
}

class ReviewsService extends BaseRepository<ReviewDecision> {
  constructor() {
    super('review_decisions');
  }

  async getAllReviews(filters: { submissionId?: string; decision?: string } | undefined, userId: string, role: string) {
    let query = `
      SELECT 
        rd.*,
        u.name as reviewer_name,
        es.id as submission_id,
        t.title as task_title
      FROM review_decisions rd
      LEFT JOIN users u ON rd.reviewer_id = u.id
      LEFT JOIN evidence_submissions es ON rd.submission_id = es.id
      LEFT JOIN tasks t ON es.task_id = t.id
      WHERE ($1 IN ('admin', 'dean', 'consultant') OR es.submitted_by = $2 OR t.assigned_to = $2)
    `;
    const params: any[] = [role, userId];
    let idx = 3;

    if (filters?.submissionId) {
      query += ` AND rd.submission_id = $${idx}`;
      params.push(filters.submissionId);
      idx++;
    }

    if (filters?.decision) {
      query += ` AND rd.decision = $${idx}`;
      params.push(filters.decision);
      idx++;
    }

    query += ' ORDER BY rd.reviewed_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  async getReviewById(reviewId: string, userId: string, role: string) {
    const result = await db.query(`
      SELECT 
        rd.*,
        u.name as reviewer_name,
        es.id as submission_id,
        es.notes as submission_notes,
        t.title as task_title
      FROM review_decisions rd
      LEFT JOIN users u ON rd.reviewer_id = u.id
      LEFT JOIN evidence_submissions es ON rd.submission_id = es.id
      LEFT JOIN tasks t ON es.task_id = t.id
      WHERE rd.id = $1 AND ($2 IN ('admin', 'dean', 'consultant') OR es.submitted_by = $3 OR t.assigned_to = $3)
    `, [reviewId, role, userId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Review not found');
    }

    return result.rows[0];
  }

  async createReview(data: { submissionId: string; decision: string; feedback: string }, reviewerId: string) {
    // Check if submission exists and is pending review
    const submissionResult = await db.query(
      'SELECT * FROM evidence_submissions WHERE id = $1',
      [data.submissionId]
    );

    if (submissionResult.rows.length === 0) {
      throw new NotFoundError('Submission not found');
    }

    const submission = submissionResult.rows[0];

    if (submission.status !== 'submitted' && submission.status !== 'under_review') {
      throw new ForbiddenError('Submission is not available for review');
    }

    return db.transaction(async (client) => {
      // Create review (DB column is 'reason', not 'feedback')
      const reviewResult = await client.query(`
        INSERT INTO review_decisions (submission_id, reviewer_id, decision, reason, reviewed_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *
      `, [data.submissionId, reviewerId, data.decision, data.feedback]);

      const review = reviewResult.rows[0];

      // Update submission status
      let newStatus = 'under_review';
      let taskStatus = 'under_review';

      if (data.decision === 'approved') {
        newStatus = 'approved';
        taskStatus = 'approved';
      } else if (data.decision === 'rejected') {
        newStatus = 'rejected';
        taskStatus = 'rejected';
      } else if (data.decision === 'revision_requested') {
        newStatus = 'resubmission_required';
        taskStatus = 'resubmission_required';
      }

      await client.query(
        'UPDATE evidence_submissions SET status = $1, updated_at = NOW() WHERE id = $2',
        [newStatus, data.submissionId]
      );

      // Update task status
      await client.query(
        'UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2',
        [taskStatus, submission.task_id]
      );

      // If approved, trigger completion percentage recalculation
      if (data.decision === 'approved') {
        const taskResult = await client.query('SELECT evidence_requirement_id FROM tasks WHERE id = $1', [submission.task_id]);
        if (taskResult.rows.length > 0) {
          const evidenceReqId = taskResult.rows[0].evidence_requirement_id;
          
          // Get standard_id
          const reqResult = await client.query('SELECT standard_id FROM evidence_requirements WHERE id = $1', [evidenceReqId]);
          if (reqResult.rows.length > 0) {
            const standardId = reqResult.rows[0].standard_id;
            
            // Call completion recalculation functions
            await client.query('SELECT recalc_standard_completion($1)', [standardId]);
          }
        }
      }

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5)`,
        [reviewerId, 'create_review', 'review_decision', review.id, JSON.stringify(data)]
      );

      return review;
    });
  }
}

export default new ReviewsService();
