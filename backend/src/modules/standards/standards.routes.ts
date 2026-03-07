import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import standardsController from './standards.controller';

const router = Router();
router.use(authenticate);

router.get('/', standardsController.getStandards);
router.get('/:id', standardsController.getStandardById);
router.post('/', authorize('standard:manage'), standardsController.createStandard);
router.put('/:id', authorize('standard:manage'), standardsController.updateStandard);
router.delete('/:id', authorize('standard:manage'), standardsController.deleteStandard);

export default router;
