import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import dashboardController from './dashboard.controller';

const router = Router();
router.use(authenticate);

// GET /api/v1/dashboard/overview - Get dashboard overview with completion stats
router.get('/overview', dashboardController.getOverview);

// GET /api/v1/dashboard/perspectives - Get perspectives with completion
router.get('/perspectives', dashboardController.getPerspectives);

// GET /api/v1/dashboard/tasks - Get task summary
router.get('/tasks', dashboardController.getTasks);

// GET /api/v1/dashboard/recent-activity - Get recent activity
router.get('/recent-activity', dashboardController.getRecentActivity);

export default router;
