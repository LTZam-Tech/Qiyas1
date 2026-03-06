import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import reviewsController from './reviews.controller';

const router = Router();
router.use(authenticate);

router.get('/', reviewsController.getReviews);
router.get('/:id', reviewsController.getReviewById);
router.post('/', authorize('review_evidence'), reviewsController.createReview);

export default router;
