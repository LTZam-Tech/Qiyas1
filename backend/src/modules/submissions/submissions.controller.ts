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

  getSubmissions = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const filters = {
      taskId: req.query.taskId as string | undefined,
      status: req.query.status as string,
    };

    const submissions = await submissionsService.getAllSubmissions(filters);
    res.json({ success: true, data: { submissions } });
  });

  getSubmissionById = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const submissionId = req.params.id as string;
    const submission = await submissionsService.getSubmissionById(submissionId);

    const canView = await canViewTask(req.user!.id, submission.task_id);
    if (!canView) {
      throw new ForbiddenError('You do not have access to this submission');
    }

    res.json({ success: true, data: { submission } });
  });

  createSubmission = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const files = (req as any).files;

    if (!files || files.length === 0) {
      throw new ValidationError('At least one file is required');
    }

    const { taskId, submissionNotes } = req.body;

    if (!taskId) {
      throw new ValidationError('Task ID is required');
    }

    const canSubmit = await canSubmitEvidence(req.user!.id, taskId as string);
    if (!canSubmit) {
      throw new ForbiddenError('You do not have permission to submit evidence for this task');
    }

    const submission = await submissionsService.createSubmission(
      { taskId: taskId as string, submissionNotes },
      files,
      req.user!.id
    );

    res.status(201).json({ success: true, data: { submission } });
  });

  downloadFile = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const submissionId = req.params.id as string;
    const fileId = req.params.fileId as string;

    const submission = await submissionsService.getSubmissionById(submissionId);
    const canView = await canViewTask(req.user!.id, submission.task_id);
    if (!canView) {
      throw new ForbiddenError('You do not have access to this file');
    }

    const url = await submissionsService.getFileDownloadUrl(submissionId, fileId);

    res.json({ success: true, data: { downloadUrl: url } });
  });
}

export default new SubmissionsController();
