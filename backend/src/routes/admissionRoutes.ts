import { Router } from 'express';
import {
  createAdmission,
  getAdmissions,
  getAdmissionById,
  updateAdmissionStatus,
  enrollStudent
} from '../controllers/admissionController';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import {
  createAdmissionSchema,
  updateAdmissionStatusSchema,
  enrollStudentSchema
} from '../validators/admissionValidator';

const router = Router();

// ─── Admission Applications ───────────────────────────────────────────────────

// Submit new application
router.post(
  '/',
  authenticate,
  authorize('super_admin', 'principal', 'office_staff'),
  validateRequest(createAdmissionSchema),
  createAdmission
);

// List all applications (paginated + filterable)
router.get(
  '/',
  authenticate,
  authorize('super_admin', 'principal', 'office_staff'),
  getAdmissions
);

// Get single application
router.get(
  '/:id',
  authenticate,
  authorize('super_admin', 'principal', 'office_staff'),
  getAdmissionById
);

// Update application status
router.patch(
  '/:id/status',
  authenticate,
  authorize('super_admin', 'principal', 'office_staff'),
  validateRequest(updateAdmissionStatusSchema),
  updateAdmissionStatus
);

// ─── Student Enrollment ───────────────────────────────────────────────────────

// Enroll approved applicant as student (creates user + student record)
router.post(
  '/:id/enroll',
  authenticate,
  authorize('super_admin', 'principal'),
  validateRequest(enrollStudentSchema),
  enrollStudent
);

export default router;
