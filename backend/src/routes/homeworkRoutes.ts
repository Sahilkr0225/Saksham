import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import {
  createHomeworkSchema,
  submitHomeworkSchema,
  updateSubmissionSchema,
} from '../validators/homeworkValidator';
import {
  createHomework,
  getHomeworkForClass,
  getMyHomework,
  submitHomework,
  getSubmissions,
  updateSubmission,
} from '../controllers/homeworkController';

const router = Router();
router.use(authenticate);

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

// Teacher grades / adds remarks to a submission
router.patch(
  '/submissions/:submissionId',
  authorize('super_admin', 'principal', 'teacher'),
  validateRequest(updateSubmissionSchema),
  updateSubmission
);

export default router;
