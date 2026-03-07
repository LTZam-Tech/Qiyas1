import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import orgStructureController from './org-structure.controller';

const router = Router();

router.use(authenticate);

router.get('/departments', orgStructureController.getDepartments);
router.get('/units', orgStructureController.getUnits);

export default router;
