import { Response, NextFunction } from 'express';
import { z } from 'zod';
import perspectivesService from './perspectives.service';
import { AuthRequest, canEditPerspective, canViewPerspective } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';
import { ValidationError, ForbiddenError } from '@/utils/errors';

const createPerspectiveSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  description: z.string().min(1, 'Description is required'),
  weight: z.number().min(0).max(100, 'Weight must be between 0 and 100'),
  displayOrder: z.number().int().min(0),
});

const updatePerspectiveSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  weight: z.number().min(0).max(100).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

class PerspectivesController {
  // GET /api/v1/perspectives
  getPerspectives = asyncHandler(async (_req: AuthRequest, res: Response, _next: NextFunction) => {
    const perspectives = await perspectivesService.getAllPerspectives();

    res.json({
      success: true,
      data: { perspectives },
    });
  });

  // GET /api/v1/perspectives/:id
  getPerspectiveById = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const perspectiveId = req.params.id as string;
    const canView = await canViewPerspective(req.user!.id, perspectiveId);
    if (!canView) {
      throw new ForbiddenError('You do not have access to this perspective');
    }

    const perspective = await perspectivesService.getPerspectiveById(perspectiveId);

    res.json({
      success: true,
      data: { perspective },
    });
  });

  // POST /api/v1/perspectives
  createPerspective = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const validation = createPerspectiveSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const perspective = await perspectivesService.createPerspective(validation.data, req.user!.id);

    res.status(201).json({
      success: true,
      data: { perspective },
    });
  });

  // PUT /api/v1/perspectives/:id
  updatePerspective = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const perspectiveId = req.params.id as string;
    const canEdit = await canEditPerspective(req.user!.id, perspectiveId);
    if (!canEdit) {
      throw new ForbiddenError('You do not have permission to edit this perspective');
    }

    const validation = updatePerspectiveSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const perspective = await perspectivesService.updatePerspective(perspectiveId, validation.data, req.user!.id);

    res.json({
      success: true,
      data: { perspective },
    });
  });

  // DELETE /api/v1/perspectives/:id
  deletePerspective = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const perspectiveId = req.params.id as string;
    const canEdit = await canEditPerspective(req.user!.id, perspectiveId);
    if (!canEdit) {
      throw new ForbiddenError('You do not have permission to delete this perspective');
    }

    await perspectivesService.deletePerspective(perspectiveId, req.user!.id);

    res.json({
      success: true,
      message: 'Perspective deleted successfully',
    });
  });
}

export default new PerspectivesController();
