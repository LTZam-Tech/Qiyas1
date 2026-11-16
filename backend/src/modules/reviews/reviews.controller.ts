import { Response, NextFunction } from 'express';
import { z } from 'zod';
import reviewsService from './reviews.service';
import { AuthRequest, canReviewSubmission } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';
import { ValidationError, ForbiddenError } from '@/utils/errors';

const createReviewSchema = z.object({
  submissionId: z.string().uuid('Invalid submission ID'),
  decision: z.enum(['approved', 'rejected', 'revision_requested']),
  feedback: z.string().min(1, 'Feedback is required'),
});

class ReviewsController {
  getReviews = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const filters = {
      submissionId: req.query.submissionId as string | undefined,
      decision: req.query.decision as string,
    };

    const reviews = await reviewsService.getAllReviews(filters, req.user!.id, req.user!.role);
    res.json({ success: true, data: { reviews } });
  });

  getReviewById = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const reviewId = req.params.id as string;
    const review = await reviewsService.getReviewById(reviewId, req.user!.id, req.user!.role);
    res.json({ success: true, data: { review } });
  });

  createReview = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const validation = createReviewSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const canReview = await canReviewSubmission(req.user!.id, validation.data.submissionId);
    if (!canReview) {
      throw new ForbiddenError('You do not have permission to review this submission');
    }

    const review = await reviewsService.createReview(validation.data, req.user!.id);

    res.status(201).json({ success: true, data: { review } });
  });
}

export default new ReviewsController();
