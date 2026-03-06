import { BaseRepository } from '@/db/repository';
import db from '@/db';
import storageService from '@/services/storage.service';
import { NotFoundError } from '@/utils/errors';
import { createHash } from 'crypto';

interface Submission {
  id: number;
  task_id: number;
  submitted_by: number;
  status: string;
  submission_notes: string;
  submitted_at: Date;
}

class SubmissionsService extends BaseRepository<Submission> {
  constructor() {
    super('evidence_submissions');
  }

  async getAllSubmissions(filters?: { taskId?: string; status?: string }) {
    let query = `
      SELECT 
        es.*,
        u.full_name as submitted_by_name,
        t.title as task_title,
        COUNT(ef.id) as file_count
      FROM evidence_submissions es
      LEFT JOIN users u ON es.submitted_by = u.id
      LEFT JOIN tasks t ON es.task_id = t.id
      LEFT JOIN evidence_files ef ON es.id = ef.submission_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (filters?.taskId) {
      query += ` AND es.task_id = $${idx}`;
      params.push(filters.taskId);
      idx++;
    }

    if (filters?.status) {
      query += ` AND es.status = $${idx}`;
      params.push(filters.status);
      idx++;
    }

    query += ' GROUP BY es.id, u.full_name, t.title ORDER BY es.submitted_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  async getSubmissionById(submissionId: string) {
    const result = await db.query(`
      SELECT 
        es.*,
        u.full_name as submitted_by_name,
        u.email as submitted_by_email,
        t.title as task_title,
        t.description as task_description
      FROM evidence_submissions es
      LEFT JOIN users u ON es.submitted_by = u.id
      LEFT JOIN tasks t ON es.task_id = t.id
      WHERE es.id = $1
    `, [submissionId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Submission not found');
    }

    // Get files
    const filesResult = await db.query(
      'SELECT * FROM evidence_files WHERE submission_id = $1 ORDER BY uploaded_at',
      [submissionId]
    );

    return {
      ...result.rows[0],
      files: filesResult.rows,
    };
  }

  async createSubmission(data: { taskId: string; submissionNotes: string }, files: any[], submittedBy: string) {
    // Create submission
    const result = await db.query(`
      INSERT INTO evidence_submissions (task_id, submitted_by, status, submission_notes, submitted_at)
      VALUES ($1, $2, 'pending_review', $3, NOW())
      RETURNING *
    `, [data.taskId, submittedBy, data.submissionNotes]);

    const submission = result.rows[0];

    // Upload files
    for (const file of files) {
      const checksum = await this.calculateChecksum(file.path);
      const objectName = await storageService.uploadFile(file.path, file.originalname, 'evidence');

      await db.query(`
        INSERT INTO evidence_files (submission_id, file_name, file_path, file_size, mime_type, checksum)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [submission.id, file.originalname, objectName, file.size, file.mimetype, checksum]);
    }

    // Update task status
    await db.query(`UPDATE tasks SET status = 'submitted', updated_at = NOW() WHERE id = $1`, [data.taskId]);

    // Audit log
    await this.logAudit(submittedBy, 'create_submission', 'evidence_submission', submission.id, { task_id: data.taskId, file_count: files.length });

    return submission;
  }

  async updateSubmissionStatus(submissionId: string, status: string, updatedBy: string) {
    await this.getSubmissionById(submissionId);

    await db.query(
      `UPDATE evidence_submissions SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, submissionId]
    );

    await this.logAudit(updatedBy, 'update_submission_status', 'evidence_submission', submissionId, { status });

    return this.getSubmissionById(submissionId);
  }

  async getFileDownloadUrl(submissionId: string, fileId: string): Promise<string> {
    const result = await db.query(
      'SELECT * FROM evidence_files WHERE id = $1 AND submission_id = $2',
      [fileId, submissionId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('File not found');
    }

    const file = result.rows[0];
    const url = await storageService.getSignedUrl(file.file_path, 'evidence', 900); // 15 min

    return url;
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const fs = require('fs');
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: any) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}

export default new SubmissionsService();
