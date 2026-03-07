import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import usersController from './users.controller';

const router = Router();
router.use(authenticate);

// GET /api/v1/users - List users (admin/dean)
router.get('/', authorize('user:manage', 'task:assign'), usersController.getUsers);

// GET /api/v1/users/:id - Get user by ID
router.get('/:id', usersController.getUserById);

// POST /api/v1/users - Create user (admin)
router.post('/', authorize('user:manage'), usersController.createUser);

// PUT /api/v1/users/:id - Update user (admin)
router.put('/:id', authorize('user:manage'), usersController.updateUser);

// DELETE /api/v1/users/:id - Delete user (admin)
router.delete('/:id', authorize('user:manage'), usersController.deleteUser);

// POST /api/v1/users/:id/assign-role - Assign role (admin)
router.post('/:id/assign-role', authorize('user:manage'), usersController.assignRole);

export default router;
