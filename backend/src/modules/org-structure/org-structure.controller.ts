import { Response, NextFunction } from 'express';
import { z } from 'zod';
import orgStructureService from './org-structure.service';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler, ValidationError } from '@/utils/errors';

const unitsQuerySchema = z.object({
  departmentId: z.string().uuid('Invalid department ID').optional(),
});

class OrgStructureController {
  getDepartments = asyncHandler(async (_req: AuthRequest, res: Response, _next: NextFunction) => {
    const departments = await orgStructureService.getDepartments();

    res.json({
      success: true,
      data: { departments },
    });
  });

  getUnits = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const validation = unitsQuerySchema.safeParse(req.query);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const units = await orgStructureService.getUnits(validation.data.departmentId);
    res.json({
      success: true,
      data: { units },
    });
  });
}

export default new OrgStructureController();
