import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import { linkStudentSchema } from '../validators/parentValidator';
import {
  getParents,
  getParentById,
  getMyChildren,
  linkStudent,
  unlinkStudent
} from '../controllers/parentController';

const router = Router();

// Apply authentication to all parent routes
router.use(authenticate);

// Specialized endpoint for a parent to fetch their own children
router.get('/me/children', getMyChildren);

// Admin-only endpoints - getting parents and managing parent-student relationships
router.get('/', authorize('super_admin', 'principal', 'office_staff'), getParents);

// Accessible by admins AND the specific parent themselves
router.get('/:id', authorize('super_admin', 'principal', 'office_staff', 'parent'), getParentById);

// Admin linkage endpoints
router.post(
  '/:id/link-student',
  authorize('super_admin', 'principal', 'office_staff'),
  validateRequest(linkStudentSchema),
  linkStudent
);

router.post(
  '/:id/unlink-student',
  authorize('super_admin', 'principal', 'office_staff'),
  validateRequest(linkStudentSchema), // Re-using schema since it only needs student_id
  unlinkStudent
);

export default router;
