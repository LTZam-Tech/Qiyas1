import { BaseRepository } from '@/db/repository';
import db from '@/db';
import config from '@/config';
import storageService from '@/services/storage.service';
import { NotFoundError, ValidationError } from '@/utils/errors';
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import notificationService, { NotificationType } from '@/services/notification.service';

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

  async getAllSubmissions(filters: { taskId?: string; status?: string } | undefined, userId: string, role: string) {
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
        AND ($1 = 'admin' OR $1 IN ('dean', 'consultant') OR es.submitted_by = $2 OR t.assigned_to = $2)
    `;
    const params: any[] = [role, userId];
    let idx = 3;

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

  async getAllEvidenceFiles(userId: string, role: string) {
    const query = `
      SELECT 
        ef.id as file_id,
        ef.original_filename,
        ef.uploaded_at,
        es.id as submission_id,
        es.status,
        es.review_comment,
        es.task_id,
        u.name as uploaded_by_name,
        COALESCE(s.name_ar, s2.name_ar) as standard_title,
        COALESCE(s.name_en, s2.name_en) as standard_title_en,
        COALESCE(ax.name_ar, ax2.name_ar) as axis_title,
        COALESCE(ax.name_en, ax2.name_en) as axis_title_en,
        COALESCE(d.name_ar, d2.name_ar) as domain_title,
        COALESCE(d.name_en, d2.name_en) as domain_title_en
      FROM evidence_files ef
      JOIN evidence_submissions es ON ef.submission_id = es.id
      LEFT JOIN users u ON ef.uploaded_by = u.id
      LEFT JOIN evidence_requirements er ON es.evidence_requirement_id = er.id
      LEFT JOIN standards s ON er.standard_id = s.id
      LEFT JOIN axes ax ON s.axis_id = ax.id
      LEFT JOIN perspectives d ON ax.perspective_id = d.id
      -- Fallbacks if task is mapped directly to standard without requirement
      LEFT JOIN tasks t ON es.task_id = t.id
      LEFT JOIN standards s2 ON t.standard_id = s2.id
      LEFT JOIN axes ax2 ON s2.axis_id = ax2.id
      LEFT JOIN perspectives d2 ON ax2.perspective_id = d2.id
      WHERE ($1 = 'admin' OR $1 IN ('dean', 'consultant') OR es.submitted_by = $2 OR t.assigned_to = $2)
      ORDER BY ef.uploaded_at DESC
    `;
    const result = await db.query(query, [role, userId]);
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

  async createSubmission(data: { taskId: string; standardId?: string; submissionNotes: string }, files: any[], submittedBy: string) {
    // Validate uploaded files
    for (const file of files) {
      this.validateUploadFile(file);
    }

    const isStandalone = data.taskId === 'standalone-upload' || !data.taskId;
    let evidenceRequirementId = null;
    let finalTaskId = null;

    if (!isStandalone) {
      evidenceRequirementId = await this.resolveEvidenceRequirementId(data.taskId);
      finalTaskId = data.taskId;
    } else if (data.standardId) {
      // Standalone evidence: try to get the matching requirement from standard
      const erResult = await db.query(
        'SELECT id FROM evidence_requirements WHERE standard_id = $1 LIMIT 1',
        [data.standardId]
      );
      if (erResult.rows.length > 0) {
        evidenceRequirementId = erResult.rows[0].id;
      }
    }

    // Create submission
    const result = await db.query(`
      INSERT INTO evidence_submissions (task_id, evidence_requirement_id, submitted_by, status, notes, submitted_at)
      VALUES ($1, $2, $3, 'submitted', $4, NOW())
      RETURNING *
    `, [finalTaskId, evidenceRequirementId, submittedBy, data.submissionNotes]);

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

    // Update task status only if not standalone
    if (!isStandalone) {
      await db.query(`UPDATE tasks SET status = 'submitted', updated_at = NOW() WHERE id = $1`, [finalTaskId]);
    }

    // Audit log
    await this.logAudit(submittedBy, 'create_submission', 'evidence_submission', submission.id, { task_id: data.taskId, file_count: files.length });

    // Notifications: Notify Dean, Consultant, and Admin
    try {
      await notificationService.notifyRoles(['dean', 'consultant', 'admin'], {
        type: NotificationType.EVIDENCE_UPLOADED,
        title: 'New Evidence Uploaded',
        body: `New evidence has been uploaded by ${submittedBy}.`,
        data: { submissionId: submission.id, taskId: data.taskId }
      });
    } catch (notifyError) {
      console.error('Failed to send evidence upload notifications', notifyError);
    }

    return submission;
  }

  private validateUploadFile(file: any): void {
    const maxFileSize = config.upload.maxFileSizeMB * 1024 * 1024;
    if (!file?.originalname || !file?.path) {
      throw new ValidationError('Invalid file upload payload');
    }

    const originalName = path.basename(String(file.originalname));
    if (originalName !== file.originalname || originalName.includes('..')) {
      throw new ValidationError(`Invalid file name: ${file.originalname}`);
    }

    if (!fs.existsSync(file.path)) {
      throw new ValidationError(`Uploaded file is missing on disk: ${originalName}`);
    }

    if (file.size > maxFileSize) {
      throw new ValidationError(`File "${originalName}" exceeds maximum size of ${config.upload.maxFileSizeMB}MB`);
    }

    if (!config.upload.allowedMimeTypes.includes(file.mimetype)) {
      throw new ValidationError(`File type "${file.mimetype}" is not allowed for "${originalName}"`);
    }

    const extension = path.extname(originalName).toLowerCase();
    const extMimeMap: Record<string, string[]> = {
      '.pdf': ['application/pdf'],
      '.doc': ['application/msword'],
      '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      '.xls': ['application/vnd.ms-excel'],
      '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      '.png': ['image/png'],
      '.jpg': ['image/jpeg'],
      '.jpeg': ['image/jpeg'],
    };

    const allowedForExt = extMimeMap[extension];
    if (!allowedForExt || !allowedForExt.includes(file.mimetype)) {
      throw new ValidationError(`File extension does not match MIME type for "${originalName}"`);
    }
  }

  async updateSubmissionStatus(submissionId: string, status: string, updatedBy: string, reviewComment?: string) {
    const submission = await this.getSubmissionById(submissionId);

    const updateQuery = `
      UPDATE evidence_submissions 
      SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW(), review_comment = COALESCE($4, review_comment)
      WHERE id = $3
    `;
    
    await db.query(updateQuery, [status, updatedBy, submissionId, reviewComment || null]);

    // Notifications: Notify the submitter
    try {
      await notificationService.createNotification({
        userId: submission.submitted_by,
        type: NotificationType.EVIDENCE_REVIEWED,
        title: `Evidence ${status.replace('_', ' ')}`,
        body: `Your evidence submission has been ${status.replace('_', ' ')}.`,
        data: { submissionId, status }
      });
    } catch (notifyError) {
      console.error('Failed to send evidence review notification', notifyError);
    }

    await this.logAudit(updatedBy, 'update_submission_status', 'evidence_submission', submissionId, { status });

    return this.getSubmissionById(submissionId);
  }

  async getFilePath(submissionId: string, fileId: string): Promise<{ path: string; filename: string }> {
    const result = await db.query(
      'SELECT storage_path, stored_filename, original_filename FROM evidence_files WHERE id = $1 AND submission_id = $2',
      [fileId, submissionId]
    );
    if (result.rows.length === 0) throw new NotFoundError('File not found');
    const file = result.rows[0];
    const storageName = file.storage_path || file.stored_filename;
    return {
      path: storageService.getFilePath(storageName, 'evidence'),
      filename: path.basename(file.original_filename || 'evidence'),
    };
  }

  private async resolveEvidenceRequirementId(taskId: string): Promise<string> {
    const taskResult = await db.query(
      'SELECT id, evidence_requirement_id FROM tasks WHERE id = $1',
      [taskId]
    );

    if (taskResult.rows.length === 0) {
      throw new NotFoundError('Task not found');
    }

    const task = taskResult.rows[0];

    if (task.evidence_requirement_id) {
      return task.evidence_requirement_id;
    }

    throw new ValidationError(
      'Task is missing evidence requirement configuration. Set evidence_requirement_id before submission.'
    );
  }

  private async calculateChecksum(filePath: string): Promise<string> {
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
