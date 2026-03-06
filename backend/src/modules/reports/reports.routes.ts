import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { reportQueue } from '@/queue';
import { asyncHandler } from '@/utils/errors';
import { AuthRequest } from '@/middleware/auth';
import { Response, NextFunction } from 'express';

const router = Router();
router.use(authenticate);

// POST /api/v1/reports/generate
const generateReport = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction): Promise<void> => {
  const { type, filters } = req.body;

  if (!type || !['completion', 'detailed', 'dashboard_snapshot'].includes(type)) {
    res.status(400).json({
      success: false,
      error: { message: 'Invalid report type' },
    });
    return;
  }

  const job = await reportQueue.add({
    type,
    userId: req.user!.id,
    filters,
  });

  res.status(202).json({
    success: true,
    message: 'Report generation started',
    data: { jobId: job.id },
  });
  return;
});

router.post('/generate', authorize('view_reports'), generateReport);

export default router;
