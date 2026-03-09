import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import notificationsController from './notifications.controller';

const router = Router();

router.use(authenticate);

router.get('/', notificationsController.getNotifications);
router.post('/mark-all-read', notificationsController.markAllAsRead);
router.post('/:id/mark-read', notificationsController.markAsRead);

export default router;
