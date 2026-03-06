import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import axesController from './axes.controller';

const router = Router();
router.use(authenticate);

router.get('/', axesController.getAxes);
router.get('/:id', axesController.getAxisById);
router.post('/', authorize('manage_hierarchy'), axesController.createAxis);
router.put('/:id', authorize('manage_hierarchy'), axesController.updateAxis);
router.delete('/:id', authorize('manage_hierarchy'), axesController.deleteAxis);

export default router;
