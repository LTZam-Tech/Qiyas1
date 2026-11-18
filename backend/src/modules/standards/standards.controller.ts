import { Response, NextFunction } from 'express';
import { z } from 'zod';
import standardsService from './standards.service';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler, ValidationError } from '@/utils/errors';

const createStandardSchema = z.object({
  axisId: z.guid('Invalid axis ID'),
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  description: z.string().optional(),
  weight: z.number().min(0).max(100, 'Weight must be between 0 and 100'),
  displayOrder: z.number().int().min(0),
});

const updateStandardSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  description: z.string().optional(),
  weight: z.number().min(0).max(100).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

class StandardsController {
  getStandards = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    let axisId = req.query.axisId as string | undefined;
    if (axisId === 'undefined' || axisId === 'null') axisId = undefined;
    const standards = await standardsService.getAllStandards(axisId);
    res.json({ success: true, data: { standards } });
  });

  getStandardById = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const standardId = req.params.id as string;
    const standard = await standardsService.getStandardById(standardId);
    res.json({ success: true, data: { standard } });
  });

  createStandard = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const validation = createStandardSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }
    const standard = await standardsService.createStandard(validation.data, req.user!.id);
    res.status(201).json({ success: true, data: { standard } });
  });

  updateStandard = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const standardId = req.params.id as string;
    const validation = updateStandardSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }
    const standard = await standardsService.updateStandard(standardId, validation.data, req.user!.id);
    res.json({ success: true, data: { standard } });
  });

  deleteStandard = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const standardId = req.params.id as string;
    await standardsService.deleteStandard(standardId, req.user!.id);
    res.json({ success: true, message: 'Standard deleted successfully' });
  });
}

export default new StandardsController();
