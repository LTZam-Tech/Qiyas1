import { Response, NextFunction } from 'express';
import { z } from 'zod';
import usersService from './users.service';
import type { UpdateUserDto } from './users.service';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';
import { ValidationError } from '@/utils/errors';

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  roleId: z.string().uuid('Invalid role ID'),
  departmentId: z.string().uuid('Invalid department ID').optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  roleId: z.string().uuid('Invalid role ID').optional(),
  departmentId: z.string().uuid('Invalid department ID').nullish(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

class UsersController {
  // GET /api/v1/users
  getUsers = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const filters = {
      role: req.query.role as string | undefined,
      department: req.query.department as string | undefined,
      status: req.query.status as string | undefined,
    };

    const users = await usersService.getAllUsers(filters);

    res.json({
      success: true,
      data: { users },
    });
  });

  // GET /api/v1/users/:id
  getUserById = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const user = await usersService.getUserById(userId);

    res.json({
      success: true,
      data: { user },
    });
  });

  // POST /api/v1/users
  createUser = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const validation = createUserSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const user = await usersService.createUser(validation.data, req.user!.id);

    res.status(201).json({
      success: true,
      data: { user },
    });
  });

  // PUT /api/v1/users/:id
  updateUser = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const validation = updateUserSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const user = await usersService.updateUser(userId, validation.data as UpdateUserDto, req.user!.id);

    res.json({
      success: true,
      data: { user },
    });
  });

  // DELETE /api/v1/users/:id
  deleteUser = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    await usersService.deleteUser(userId, req.user!.id);

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  });

  // POST /api/v1/users/:id/assign-role
  assignRole = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const { roleId } = req.body;

    if (!roleId || typeof roleId !== 'string') {
      throw new ValidationError('Valid role ID is required');
    }

    await usersService.assignRole(userId, roleId, req.user!.id);

    res.json({
      success: true,
      message: 'Role assigned successfully',
    });
  });
}

export default new UsersController();
