import { Router } from 'express';
import {
  getStudents,
  getStudentById,
  updateStudent,
  updateStudentStatus,
  assignStudentSection
} from '../controllers/studentController';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import {
  updateStudentSchema,
  updateStudentStatusSchema,
  assignStudentSectionSchema
} from '../validators/studentValidator';

const router = Router();

// List all students
router.get(
  '/',
  authenticate,
  authorize('super_admin', 'principal', 'office_staff', 'teacher'),
  getStudents
);

// Detail lookup for a single student file (Self/Parent security logic is checked directly inside handler)
router.get(
  '/:id',
  authenticate,
  getStudentById
);

// Edit student personal details
router.put(
  '/:id',
  authenticate,
  authorize('super_admin', 'principal', 'office_staff'),
  validateRequest(updateStudentSchema),
  updateStudent
);

// Transition student status (transferred, graduated, suspended)
router.patch(
  '/:id/status',
  authenticate,
  authorize('super_admin', 'principal'),
  validateRequest(updateStudentStatusSchema),
  updateStudentStatus
);

// Promote or assign section/roll
router.patch(
  '/:id/section',
  authenticate,
  authorize('super_admin', 'principal', 'office_staff'),
  validateRequest(assignStudentSectionSchema),
  assignStudentSection
);

export default router;
