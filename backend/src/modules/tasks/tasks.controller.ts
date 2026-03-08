import { Response, NextFunction } from 'express';
import { z } from 'zod';
import tasksService from './tasks.service';
import { AuthRequest, canViewTask } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';
import { ValidationError, ForbiddenError } from '@/utils/errors';

const titleRegex = /^(?=.{1,50}$)[A-Za-z\u0600-\u06FF\s]+$/u;
const descriptionRegex = /^(?=.{0,300}$)[A-Za-z0-9\u0600-\u06FF\s]*$/u;

const createTaskSchema = z.object({
  title: z.string().regex(titleRegex, 'Task name must be Arabic/English letters only and max 50 chars'),
  perspectiveId: z.string().min(1, 'Perspective ID is required'),
  axisId: z.string().min(1, 'Axis ID is required'),
  standardId: z.string().min(1, 'Standard ID is required'),
  evidenceType: z.enum(['file', 'screenshot']),
  assignedTo: z.string().min(1, 'Assigned user ID is required'),
  targetType: z.enum(['department', 'unit']),
  targetId: z.string().min(1, 'Target ID is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  priority: z.enum(['critical', 'high', 'normal', 'low']),
  description: z.string().regex(descriptionRegex, 'Description must be alphanumeric (Arabic/English) max 300 chars').optional(),
});

const updateTaskSchema = z.object({
  title: z.string().regex(titleRegex, 'Task name must be Arabic/English letters only and max 50 chars').optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
  status: z.enum(['draft', 'assigned', 'in_progress', 'submitted', 'under_review', 'approved', 'rejected', 'resubmission_required', 'closed', 'cancelled']).optional(),
  description: z.string().regex(descriptionRegex, 'Description must be alphanumeric (Arabic/English) max 300 chars').optional(),
  completionNotes: z.string().optional(),
});

class TasksController {
  getTasks = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    let assignedTo = req.query.assignedTo as string | undefined;
    if (assignedTo === 'undefined' || assignedTo === 'null') assignedTo = undefined;
    let status = req.query.status as string | undefined;
    if (status === 'undefined' || status === 'null') status = undefined;
    let priority = req.query.priority as string | undefined;
    if (priority === 'undefined' || priority === 'null') priority = undefined;

    const filters = {
      assignedTo,
      status,
      priority,
    };

    const tasks = await tasksService.getAllTasks(filters, req.user!.id, req.user!.role);
    res.json({ success: true, data: { tasks } });
  });

  getTaskById = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const taskId = req.params.id as string;
    const canView = await canViewTask(req.user!.id, taskId);
    if (!canView) {
      throw new ForbiddenError('You do not have access to this task');
    }

    const task = await tasksService.getTaskById(taskId);
    res.json({ success: true, data: { task } });
  });

  createTask = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const validation = createTaskSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const task = await tasksService.createTask(validation.data, req.user!.id);
    res.status(201).json({ success: true, data: { task } });
  });

  updateTask = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const taskId = req.params.id as string;
    const canView = await canViewTask(req.user!.id, taskId);
    if (!canView) {
      throw new ForbiddenError('You do not have access to update this task');
    }

    const validation = updateTaskSchema.safeParse(req.body);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.error.issues);
    }

    const task = await tasksService.updateTask(taskId, validation.data, req.user!.id);
    res.json({ success: true, data: { task } });
  });

  deleteTask = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const taskId = req.params.id as string;
    await tasksService.deleteTask(taskId, req.user!.id);
    res.json({ success: true, message: 'Task deleted successfully' });
  });

  getMyTasks = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const tasks = await tasksService.getTasksByUser(req.user!.id);
    res.json({ success: true, data: { tasks } });
  });
}

export default new TasksController();
