import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import {
  createExamSchema,
  createExamSubjectSchema,
  enterBulkMarksSchema,
  updateExamStatusSchema,
} from '../validators/examValidator';
import {
  createExam,
  addExamSubject,
  enterBulkMarks,
  updateExamStatus,
  getExamsForClass,
  getExamDetails,
  getStudentResult,
  getClassResults,
} from '../controllers/examController';

const router = Router();
router.use(authenticate);

// Create a new exam term
router.post(
  '/',
  authorize('super_admin', 'principal', 'teacher'),
  validateRequest(createExamSchema),
  createExam
);

// Add a subject schedule to an exam
router.post(
  '/subjects',
  authorize('super_admin', 'principal', 'teacher'),
  validateRequest(createExamSubjectSchema),
  addExamSubject
);

// Enter / update bulk student marks for a subject
router.post(
  '/marks',
  authorize('super_admin', 'principal', 'teacher'),
  validateRequest(enterBulkMarksSchema),
  enterBulkMarks
);

// Transition exam status (e.g. publish results)
router.patch(
  '/:id/status',
  authorize('super_admin', 'principal'),
  validateRequest(updateExamStatusSchema),
  updateExamStatus
);

// List exams for a class
router.get(
  '/class/:classId',
  authorize('super_admin', 'principal', 'teacher'),
  getExamsForClass
);

// Get single exam details with subject schedule
router.get(
  '/:id',
  authorize('super_admin', 'principal', 'teacher', 'student', 'parent'),
  getExamDetails
);

// Get individual student report card (Students/Parents check publish status)
router.get(
  '/:id/results/student/:studentId',
  authorize('super_admin', 'principal', 'teacher', 'student', 'parent'),
  getStudentResult
);

// Get class-wide result summary for teachers/principals
router.get(
  '/:id/results/class/:classId',
  authorize('super_admin', 'principal', 'teacher'),
  getClassResults
);

export default router;
