import { Response, NextFunction } from 'express';
import { z } from 'zod';
import axesService from './axes.service';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler, ValidationError } from '@/utils/errors';

const createAxisSchema = z.object({
  perspectiveId: z.string().uuid('Invalid perspective ID'),
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  description: z.string().optional(),
  weight: z.number().min(0).max(100, 'Weight must be between 0 and 100'),
  displayOrder: z.number().int().min(0),
});

const updateAxisSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().optional(),
  weight: z.number().min(0).max(100).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

class AxesController {
  getAxes = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const perspectiveId = req.query.perspectiveId as string | undefined;
    const axes = await axesService.getAllAxes(perspectiveId);
    res.json({ success: true, data: { axes } });
  });

  getAxisById = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const axisId = req.params.id as string;
    const axis = await axesService.getAxisById(axisId);
    res.json({ success: true, data: { axis } });
  });

  createAxis = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const validation = createAxisSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }
    const axis = await axesService.createAxis(validation.data, req.user!.id);
    res.status(201).json({ success: true, data: { axis } });
  });

  updateAxis = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const axisId = req.params.id as string;
    const validation = updateAxisSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }
    const axis = await axesService.updateAxis(axisId, validation.data, req.user!.id);
    res.json({ success: true, data: { axis } });
  });

  deleteAxis = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const axisId = req.params.id as string;
    await axesService.deleteAxis(axisId, req.user!.id);
    res.json({ success: true, message: 'Axis deleted successfully' });
  });
}

export default new AxesController();
