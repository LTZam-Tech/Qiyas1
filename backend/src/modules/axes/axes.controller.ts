import { Response, NextFunction } from 'express';
import axesService from './axes.service';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';

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
    const axis = await axesService.createAxis(req.body, req.user!.id);
    res.status(201).json({ success: true, data: { axis } });
  });

  updateAxis = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const axisId = req.params.id as string;
    const axis = await axesService.updateAxis(axisId, req.body, req.user!.id);
    res.json({ success: true, data: { axis } });
  });

  deleteAxis = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const axisId = req.params.id as string;
    await axesService.deleteAxis(axisId, req.user!.id);
    res.json({ success: true, message: 'Axis deleted successfully' });
  });
}

export default new AxesController();
