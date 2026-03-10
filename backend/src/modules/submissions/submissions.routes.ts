import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import submissionsController from './submissions.controller';

const router = Router();
router.use(authenticate);

router.get('/', submissionsController.getSubmissions);
router.get('/files', submissionsController.getEvidenceFiles);
router.get('/:id', submissionsController.getSubmissionById);
router.post('/', submissionsController.uploadMiddleware, submissionsController.createSubmission);
router.put('/:id/status', submissionsController.updateSubmissionStatus);
router.get('/:id/files/:fileId/download', submissionsController.downloadFile);

export default router;
