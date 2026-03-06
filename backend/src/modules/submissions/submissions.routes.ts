import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import submissionsController from './submissions.controller';

const router = Router();
router.use(authenticate);

router.get('/', submissionsController.getSubmissions);
router.get('/:id', submissionsController.getSubmissionById);
router.post('/', authorize('submit_evidence'), submissionsController.uploadMiddleware, submissionsController.createSubmission);
router.get('/:id/files/:fileId/download', submissionsController.downloadFile);

export default router;
