import { Response, NextFunction } from 'express';
import { z } from 'zod';
import authService from './auth.service';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';
import { ValidationError } from '@/utils/errors';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  roleId: z.number().int().positive('Valid role ID is required'),
  departmentId: z.number().int().positive().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

// const refreshTokenSchema = z.object({
//   refreshToken: z.string().min(1, 'Refresh token is required'),
// });

class AuthController {
  // POST /api/v1/auth/login
  login = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    console.log('🔐 Login request received');
    console.log('Request body:', { email: req.body.email, password: '***' });
    console.log('Request IP:', req.ip);
    
    const validation = loginSchema.safeParse(req.body);
    
    if (!validation.success) {
      console.error('❌ Validation failed:', validation.error.issues);
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const { email, password } = validation.data;
    const ipAddress = req.ip || 'unknown';

    console.log('✅ Validation passed, calling auth service...');
    const result = await authService.login(email, password, ipAddress);
    console.log('✅ Auth service returned:', { 
      userId: result.user.id, 
      email: result.user.email,
      hasAccessToken: !!result.tokens.accessToken,
      hasRefreshToken: !!result.tokens.refreshToken,
    });

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    console.log('✅ Sending success response to client');
    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
      },
    });
  });

  // POST /api/v1/auth/register
  register = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const validation = registerSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const user = await authService.register(validation.data);

    res.status(201).json({
      success: true,
      data: { user },
    });
  });

  // POST /api/v1/auth/refresh
  refresh = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    const tokens = await authService.refreshAccessToken(refreshToken);

    // Set new refresh token as httpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
      },
    });
  });

  // POST /api/v1/auth/logout
  logout = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  });

  // POST /api/v1/auth/change-password
  changePassword = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const validation = changePasswordSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const { currentPassword, newPassword } = validation.data;
    const userId = req.user!.id;

    await authService.changePassword(userId, currentPassword, newPassword);

    // Clear refresh token cookie (user will need to login again)
    res.clearCookie('refreshToken');

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.',
    });
  });

  // GET /api/v1/auth/me
  getCurrentUser = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user!.id;
    const user = await authService.getCurrentUser(userId);

    res.json({
      success: true,
      data: { user },
    });
  });
}

export default new AuthController();
