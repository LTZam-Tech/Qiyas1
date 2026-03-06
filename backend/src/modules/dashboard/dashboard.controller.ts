import { Response, NextFunction } from 'express';
import dashboardService from './dashboard.service';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';

class DashboardController {
  // GET /api/v1/dashboard/overview
  getOverview = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user!.id;
    const role = req.user!.role;

    const overview = await dashboardService.getOverview(userId, role);

    res.json({
      success: true,
      data: { overview },
    });
  });

  // GET /api/v1/dashboard/perspectives
  getPerspectives = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user!.id;
    const role = req.user!.role;

    const perspectives = await dashboardService.getPerspectives(userId, role);

    res.json({
      success: true,
      data: { perspectives },
    });
  });

  // GET /api/v1/dashboard/tasks
  getTasks = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user!.id;
    const role = req.user!.role;

    const tasks = await dashboardService.getTasks(userId, role);

    res.json({
      success: true,
      data: { tasks },
    });
  });

  // GET /api/v1/dashboard/recent-activity
  getRecentActivity = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user!.id;
    const role = req.user!.role;
    const limit = parseInt(req.query.limit as string) || 10;

    const activity = await dashboardService.getRecentActivity(userId, role, limit);

    res.json({
      success: true,
      data: { activity },
    });
  });
}

export default new DashboardController();
