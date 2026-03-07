import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import axesController from './axes.controller';

const router = Router();
router.use(authenticate);

router.get('/', axesController.getAxes);
router.get('/:id', axesController.getAxisById);
router.post('/', authorize('perspective:manage'), axesController.createAxis);
router.put('/:id', authorize('perspective:manage'), axesController.updateAxis);
router.delete('/:id', authorize('perspective:manage'), axesController.deleteAxis);

export default router;
