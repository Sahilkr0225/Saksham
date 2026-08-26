import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import { updateTeacherProfileSchema } from '../validators/teacherValidator';
import {
  getTeachers,
  getTeacherById,
  getMyProfile,
  updateTeacher,
  getTeacherSubjects
} from '../controllers/teacherController';

const router = Router();

// Apply authentication to all teacher routes
router.use(authenticate);

// Specialized endpoint for a teacher to fetch their own profile
router.get('/me', getMyProfile);

// Admin-only endpoints - getting teachers
router.get('/', authorize('super_admin', 'principal', 'office_staff'), getTeachers);

// Accessible by admins AND the specific teacher themselves
router.get('/:id', authorize('super_admin', 'principal', 'office_staff', 'teacher'), getTeacherById);
router.get('/:id/subjects', authorize('super_admin', 'principal', 'office_staff', 'teacher'), getTeacherSubjects);

// Admin only - updating full teacher profile
router.put(
  '/:id',
  authorize('super_admin', 'principal', 'office_staff'),
  validateRequest(updateTeacherProfileSchema),
  updateTeacher
);

export default router;
