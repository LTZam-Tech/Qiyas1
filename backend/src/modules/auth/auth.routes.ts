import { Router } from 'express';
import authController from './auth.controller';
import { authenticate, authorize } from '@/middleware/auth';
import rateLimit from 'express-rate-limit';
import config from '@/config';

const router = Router();

const loginLimiter = rateLimit({
	windowMs: config.security.lockoutDurationMinutes * 60 * 1000,
	max: config.security.maxLoginAttempts * 3,
	message: {
		success: false,
		error: {
			type: 'https://errors.platform.sa/rate-limit',
			title: 'Too Many Requests',
			status: 429,
			detail: 'Too many login attempts from this IP. Please try again later.',
		},
	},
	standardHeaders: true,
	legacyHeaders: false,
});

const changePasswordLimiter = rateLimit({
	windowMs: config.security.lockoutDurationMinutes * 60 * 1000,
	max: config.security.maxLoginAttempts,
	message: {
		success: false,
		error: {
			type: 'https://errors.platform.sa/rate-limit',
			title: 'Too Many Requests',
			status: 429,
			detail: 'Too many password change attempts. Please try again later.',
		},
	},
	standardHeaders: true,
	legacyHeaders: false,
});

// Public routes
router.post('/login', loginLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// Protected routes
router.use(authenticate); // All routes below require authentication

router.get('/me', authController.getCurrentUser);
router.post('/change-password', changePasswordLimiter, authController.changePassword);
router.post('/register', authorize('user:manage'), authController.register);

export default router;
