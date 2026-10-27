import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import { updateSettingsSchema, promoteStudentsSchema } from '../validators/adminValidator';
import {
  getSettings,
  updateSettings,
  promoteStudents,
  getBackup
} from '../controllers/adminController';

const router = Router();

// All admin routes require authentication
router.use(authenticate);

// View school settings (all authenticated users)
router.get('/settings', getSettings);

// Update settings (super_admin only)
router.put('/settings', authorize('super_admin'), validateRequest(updateSettingsSchema), updateSettings);

// Bulk student promotion (super_admin & principal)
router.post(
  '/promote-students',
  authorize('super_admin', 'principal'),
  validateRequest(promoteStudentsSchema),
  promoteStudents
);

// Full JSON system backup (super_admin only)
router.get('/backup', authorize('super_admin'), getBackup);

export default router;
