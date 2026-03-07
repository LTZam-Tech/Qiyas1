import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import dashboardController from './dashboard.controller';

const router = Router();
router.use(authenticate);

// GET /api/v1/dashboard/summary - Complete dashboard summary (combines all data)
router.get('/summary', authorize('dashboard:read_global'), dashboardController.getSummary);

// GET /api/v1/dashboard/overview - Get dashboard overview with completion stats
router.get('/overview', authorize('dashboard:read_global'), dashboardController.getOverview);

// GET /api/v1/dashboard/perspectives - Get perspectives with completion
router.get('/perspectives', authorize('dashboard:read_global'), dashboardController.getPerspectives);

// GET /api/v1/dashboard/tasks - Get task summary
router.get('/tasks', authorize('dashboard:read_global'), dashboardController.getTasks);

// GET /api/v1/dashboard/recent-activity - Get recent activity
router.get('/recent-activity', authorize('dashboard:read_global'), dashboardController.getRecentActivity);

export default router;
