import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import {
  createHomeworkSchema,
  updateHomeworkSchema,
  submitHomeworkSchema,
  updateSubmissionSchema,
} from '../validators/homeworkValidator';
import {
  createHomework,
  getAllHomework,
  getHomeworkForClass,
  getHomeworkById,
  updateHomework,
  deleteHomework,
  getMyHomework,
  submitHomework,
  getSubmissions,
  updateSubmission,
} from '../controllers/homeworkController';

const router = Router();
router.use(authenticate);

// List all homework (with optional query filters: academic_year_id, class_id, section_id, subject_id, status, search)
router.get(
  '/',
  authorize('super_admin', 'principal', 'teacher'),
  getAllHomework
);

// Teacher/Admin creates homework
router.post(
  '/',
  authorize('super_admin', 'principal', 'teacher'),
  validateRequest(createHomeworkSchema),
  createHomework
);

// Get all homework for a class (teacher/admin/principal view)
router.get(
  '/class/:classId',
  authorize('super_admin', 'principal', 'teacher'),
  getHomeworkForClass
);

// Student sees their own pending homework
router.get(
  '/my',
  authorize('student'),
  getMyHomework
);

// Teacher grades / adds remarks to a submission (registered before single :homeworkId route)
router.patch(
  '/submissions/:submissionId',
  authorize('super_admin', 'principal', 'teacher'),
  validateRequest(updateSubmissionSchema),
  updateSubmission
);

// Get single homework details with submission stats
router.get(
  '/:homeworkId',
  authorize('super_admin', 'principal', 'teacher'),
  getHomeworkById
);

// Update homework assignment
router.patch(
  '/:homeworkId',
  authorize('super_admin', 'principal', 'teacher'),
  validateRequest(updateHomeworkSchema),
  updateHomework
);

// Delete homework assignment
router.delete(
  '/:homeworkId',
  authorize('super_admin', 'principal'),
  deleteHomework
);

// Student submits homework (max 2 attempts — enforced in controller)
router.post(
  '/:homeworkId/submit',
  authorize('student'),
  validateRequest(submitHomeworkSchema),
  submitHomework
);

// Teacher views all student submissions for one assignment
router.get(
  '/:homeworkId/submissions',
  authorize('super_admin', 'principal', 'teacher'),
  getSubmissions
);

export default router;
