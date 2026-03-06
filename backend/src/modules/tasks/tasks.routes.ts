import { Router } from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import tasksController from './tasks.controller';

const router = Router();
router.use(authenticate);

router.get('/', tasksController.getTasks);
router.get('/my-tasks', tasksController.getMyTasks);
router.get('/:id', tasksController.getTaskById);
router.post('/', authorize('create_task'), tasksController.createTask);
router.put('/:id', tasksController.updateTask);
router.delete('/:id', authorize('create_task'), tasksController.deleteTask);

export default router;
