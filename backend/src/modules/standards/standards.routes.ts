import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import standardsController from './standards.controller';

const router = Router();
router.use(authenticate);

router.get('/', standardsController.getStandards);
router.get('/:id', standardsController.getStandardById);
router.post('/', authorize('manage_hierarchy'), standardsController.createStandard);
router.put('/:id', authorize('manage_hierarchy'), standardsController.updateStandard);
router.delete('/:id', authorize('manage_hierarchy'), standardsController.deleteStandard);

export default router;
