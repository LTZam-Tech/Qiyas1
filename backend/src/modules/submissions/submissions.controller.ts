import { Response, NextFunction } from 'express';
import multer from 'multer';
import submissionsService from './submissions.service';
import { AuthRequest, canSubmitEvidence, canViewTask } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';
import { ValidationError, ForbiddenError } from '@/utils/errors';
import config from '@/config';

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: config.upload.maxFileSizeMB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

class SubmissionsController {
  uploadMiddleware = upload.array('files', 10);

  getSubmissions = asyncHandler(async (req: any, res: any, _next: any) => {
    let taskId = req.query.taskId as string | undefined;
    if (taskId === 'undefined' || taskId === 'null') taskId = undefined;
    let status = req.query.status as string | undefined;
    if (status === 'undefined' || status === 'null') status = undefined;

    const filters = {
      taskId,
      status,
    };

    const submissions = await submissionsService.getAllSubmissions(filters);
    res.json({ success: true, data: { submissions } });
  });

  getEvidenceFiles = asyncHandler(async (_req: any, res: any, _next: any) => {
    const files = await submissionsService.getAllEvidenceFiles();
    res.json({ success: true, data: { files } });
  });

  getSubmissionById = asyncHandler(async (req: any, res: any, _next: any) => {
    const authReq = req as AuthRequest;
    const submissionId = req.params.id as string;
    const submission = await submissionsService.getSubmissionById(submissionId);

    const canView = await canViewTask(authReq.user!.id, submission.task_id);
    if (!canView) {
      throw new ForbiddenError('You do not have access to this submission');
    }

    res.json({ success: true, data: { submission } });
  });

  createSubmission = asyncHandler(async (req: any, res: any, _next: any) => {
    const authReq = req as AuthRequest;
    const files = (req as any).files;

    if (!files || files.length === 0) {
      throw new ValidationError('At least one file is required');
    }

    const { taskId, standardId, submissionNotes } = req.body as any;

    if (!taskId && !standardId) {
      throw new ValidationError('Task ID or Standard ID is required');
    }

    if (taskId && taskId !== 'standalone-upload') {
      const canSubmit = await canSubmitEvidence(authReq.user!.id, taskId as string);
      if (!canSubmit) {
        throw new ForbiddenError('You do not have permission to submit evidence for this task');
      }
    }

    const submission = await submissionsService.createSubmission(
      { taskId: taskId as string, standardId: standardId as string, submissionNotes },
      files,
      authReq.user!.id
    );

    res.status(201).json({ success: true, data: { submission } });
  });

  updateSubmissionStatus = asyncHandler(async (req: any, res: any, _next: any) => {
    const authReq = req as AuthRequest;
    const submissionId = req.params.id as string;
    const { status } = req.body;

    if (!status) {
      throw new ValidationError('Status is required');
    }

    const validStatuses = ['approved', 'rejected', 'revision_required', 'under_review'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Role check logic can use canReviewSubmission if desired
    // For now we will check in the service layer or rely on route guards,
    // but the requirement says Dean and Consultant can review, so let's allow it
    const role = authReq.user!.role;
    if (role !== 'admin' && role !== 'consultant' && role !== 'dean') {
       throw new ForbiddenError('You do not have permission to review submissions');
    }

    const { reviewComment } = req.body;
      // Enforce comment requirement for revert (revision_required)
      if (status === 'revision_required' && (!reviewComment || reviewComment.trim() === '')) {
        throw new ValidationError('A comment is required when reverting evidence to uploader.');
      }

    const submission = await submissionsService.updateSubmissionStatus(submissionId, status, authReq.user!.id, reviewComment);
    res.json({ success: true, data: { submission } });
  });

  downloadFile = asyncHandler(async (req: any, res: any, _next: any) => {
    const authReq = req as AuthRequest;
    const submissionId = req.params.id as string;
    const fileId = req.params.fileId as string;

    const submission = await submissionsService.getSubmissionById(submissionId);
    
    // If evidence is tied to a specific task, check if the user has permission to view that task
    if (submission.task_id) {
      const canView = await canViewTask(authReq.user!.id, submission.task_id);
      if (!canView) {
        throw new ForbiddenError('You do not have access to this file');
      }
    }

    const url = await submissionsService.getFileDownloadUrl(submissionId, fileId);

    res.json({ success: true, data: { downloadUrl: url } });
  });
}

export default new SubmissionsController();
