import { Response, NextFunction } from 'express';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';
import notificationService from '@/services/notification.service';

class NotificationsController {
  getNotifications = asyncHandler(async (req: any, res: any, _next: any) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const notifications = await notificationService.getUserNotifications(userId, limit);
    res.json({ success: true, data: { notifications } });
  });

  markAsRead = asyncHandler(async (req: any, res: any, _next: any) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const notificationId = req.params.id;
    
    await notificationService.markAsRead(notificationId, userId);
    res.json({ success: true });
  });

  markAllAsRead = asyncHandler(async (req: any, res: any, _next: any) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    
    await notificationService.markAllAsRead(userId);
    res.json({ success: true });
  });
}

export default new NotificationsController();
