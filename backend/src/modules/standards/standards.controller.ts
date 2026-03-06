import { Response, NextFunction } from 'express';
import standardsService from './standards.service';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';

class StandardsController {
  getStandards = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const axisId = req.query.axisId as string | undefined;
    const standards = await standardsService.getAllStandards(axisId);
    res.json({ success: true, data: { standards } });
  });

  getStandardById = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const standardId = req.params.id as string;
    const standard = await standardsService.getStandardById(standardId);
    res.json({ success: true, data: { standard } });
  });

  createStandard = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const standard = await standardsService.createStandard(req.body, req.user!.id);
    res.status(201).json({ success: true, data: { standard } });
  });

  updateStandard = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const standardId = req.params.id as string;
    const standard = await standardsService.updateStandard(standardId, req.body, req.user!.id);
    res.json({ success: true, data: { standard } });
  });

  deleteStandard = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const standardId = req.params.id as string;
    await standardsService.deleteStandard(standardId, req.user!.id);
    res.json({ success: true, message: 'Standard deleted successfully' });
  });
}

export default new StandardsController();
