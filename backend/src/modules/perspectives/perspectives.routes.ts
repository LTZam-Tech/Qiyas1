import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import perspectivesController from './perspectives.controller';

const router = Router();
router.use(authenticate);

// GET /api/v1/perspectives - List all perspectives
router.get('/', perspectivesController.getPerspectives);

// GET /api/v1/perspectives/:id - Get perspective by ID
router.get('/:id', perspectivesController.getPerspectiveById);

// POST /api/v1/perspectives - Create perspective (admin/dean)
router.post('/', authorize('perspective:manage'), perspectivesController.createPerspective);

// PUT /api/v1/perspectives/:id - Update perspective (admin/dean)
router.put('/:id', authorize('perspective:manage'), perspectivesController.updatePerspective);

// DELETE /api/v1/perspectives/:id - Delete perspective (admin)
router.delete('/:id', authorize('perspective:manage'), perspectivesController.deletePerspective);

export default router;
