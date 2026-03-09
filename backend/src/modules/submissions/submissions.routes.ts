import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import submissionsController from './submissions.controller';

const router = Router();
router.use(authenticate);

router.get('/', submissionsController.getSubmissions);
router.get('/files', submissionsController.getEvidenceFiles);
router.get('/:id', submissionsController.getSubmissionById);
router.post('/', authorize('evidence:submit'), submissionsController.uploadMiddleware, submissionsController.createSubmission);
router.get('/:id/files/:fileId/download', submissionsController.downloadFile);

export default router;
