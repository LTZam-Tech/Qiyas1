import { BaseRepository } from '@/db/repository';
import db from '@/db';
import config from '@/config';
import storageService from '@/services/storage.service';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { createHash } from 'crypto';
import path from 'path';

interface Submission {
  id: string;
  task_id: string;
  submitted_by: string;
  evidence_requirement_id: string;
  status: string;
  notes: string;
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
        u.name as submitted_by_name,
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

    query += ' GROUP BY es.id, u.name, t.title ORDER BY es.submitted_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  }

  async getSubmissionById(submissionId: string) {
    const result = await db.query(`
      SELECT 
        es.*,
        u.name as submitted_by_name,
        u.email as submitted_by_email,
        t.title as task_title,
        t.instructions as task_description
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
    // Validate uploaded files
    const maxFileSize = config.upload.maxFileSizeMB * 1024 * 1024;
    for (const file of files) {
      if (file.size > maxFileSize) {
        throw new ValidationError(`File "${file.originalname}" exceeds maximum size of ${config.upload.maxFileSizeMB}MB`);
      }
      if (!config.upload.allowedMimeTypes.includes(file.mimetype)) {
        throw new ValidationError(`File type "${file.mimetype}" is not allowed for "${file.originalname}"`);
      }
    }

    const evidenceRequirementId = await this.resolveEvidenceRequirementId(data.taskId);

    // Create submission
    const result = await db.query(`
      INSERT INTO evidence_submissions (task_id, evidence_requirement_id, submitted_by, status, notes, submitted_at)
      VALUES ($1, $2, $3, 'submitted', $4, NOW())
      RETURNING *
    `, [data.taskId, evidenceRequirementId, submittedBy, data.submissionNotes]);

    const submission = result.rows[0];

    // Upload files
    for (const file of files) {
      const checksum = await this.calculateChecksum(file.path);
      const objectName = await storageService.uploadFile(file.path, file.originalname, 'evidence');
      const fileExt = path.extname(file.originalname || '').replace('.', '').toLowerCase();

      await db.query(`
        INSERT INTO evidence_files (
          submission_id,
          original_filename,
          stored_filename,
          storage_path,
          bucket,
          mime_type,
          file_size_bytes,
          file_ext,
          checksum_sha256,
          uploaded_by,
          uploaded_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        submission.id,
        file.originalname,
        objectName,
        objectName,
        'evidence',
        file.mimetype,
        file.size,
        fileExt,
        checksum,
        submittedBy,
      ]);
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
    const storagePath = file.storage_path || file.stored_filename;
    const url = await storageService.getSignedUrl(storagePath, 'evidence', 900); // 15 min

    return url;
  }

  private async resolveEvidenceRequirementId(taskId: string): Promise<string> {
    const taskResult = await db.query(
      'SELECT id, standard_id, evidence_requirement_id FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      throw new NotFoundError('Task not found');
    }

    const task = taskResult.rows[0];

    if (task.evidence_requirement_id) {
      return task.evidence_requirement_id;
    }

    const existingReqResult = await db.query(
      `SELECT id
       FROM evidence_requirements
       WHERE standard_id = $1 AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC
       LIMIT 1`,
      [task.standard_id]
    );

    if (existingReqResult.rows.length > 0) {
      return existingReqResult.rows[0].id;
    }

    const createdReqResult = await db.query(
      `INSERT INTO evidence_requirements (
         standard_id,
         code,
         title_en,
         title_ar,
         description_en,
         description_ar,
         is_required,
         weight,
         sort_order,
         status,
         review_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, true, 100, 1, 'active', 'pending')
       RETURNING id`,
      [
        task.standard_id,
        `AUTO-${Date.now()}`,
        'Default evidence requirement',
        'متطلب شاهد افتراضي',
        'Auto-created for task submission flow',
        'تم إنشاؤه تلقائيا لمسار رفع الشواهد',
      ]
    );

    return createdReqResult.rows[0].id;
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
