import { Router } from 'express';
import authController from './auth.controller';
import { authenticate } from '@/middleware/auth';

const router = Router();

// Public routes
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// Protected routes
router.use(authenticate); // All routes below require authentication

router.get('/me', authController.getCurrentUser);
router.post('/change-password', authController.changePassword);
router.post('/register', authController.register); // Admin only (checked via permissions in controller)

export default router;
