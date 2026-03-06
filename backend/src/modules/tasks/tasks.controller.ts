import { Response, NextFunction } from 'express';
import tasksService from './tasks.service';
import { AuthRequest } from '@/middleware/auth';
import { asyncHandler } from '@/utils/errors';

class TasksController {
  getTasks = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const filters = {
      assignedTo: req.query.assignedTo as string | undefined,
      status: req.query.status as string,
      priority: req.query.priority as string,
    };

    const tasks = await tasksService.getAllTasks(filters, req.user!.id, req.user!.role);
    res.json({ success: true, data: { tasks } });
  });

  getTaskById = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const taskId = req.params.id as string;
    const task = await tasksService.getTaskById(taskId);
    res.json({ success: true, data: { task } });
  });

  createTask = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const task = await tasksService.createTask(req.body, req.user!.id);
    res.status(201).json({ success: true, data: { task } });
  });

  updateTask = asyncHandler(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const taskId = req.params.id as string;
    const task = await tasksService.updateTask(taskId, req.body, req.user!.id);
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
