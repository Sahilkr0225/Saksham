import { Router } from 'express';
import {
  createAcademicYear,
  getAcademicYears,
  setCurrentAcademicYear,
  createClass,
  getClasses,
  createSection,
  createSubject,
  getSubjects,
  assignSubjectToClass,
  getClassSubjects
} from '../controllers/academicController';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import {
  createAcademicYearSchema,
  createClassSchema,
  createSectionSchema,
  createSubjectSchema,
  assignSubjectSchema
} from '../validators/academicValidator';

const router = Router();

// ─── Academic Years ───────────────────────────────────────────────────────────
router.post(
  '/academic-years',
  authenticate,
  authorize('super_admin', 'principal'),
  validateRequest(createAcademicYearSchema),
  createAcademicYear
);

router.get(
  '/academic-years',
  authenticate,
  getAcademicYears
);

router.post(
  '/academic-years/:id/set-current',
  authenticate,
  authorize('super_admin', 'principal'),
  setCurrentAcademicYear
);

// ─── Classes & Sections ───────────────────────────────────────────────────────
router.post(
  '/classes',
  authenticate,
  authorize('super_admin', 'principal'),
  validateRequest(createClassSchema),
  createClass
);

router.get(
  '/classes',
  authenticate,
  getClasses
);

router.post(
  '/sections',
  authenticate,
  authorize('super_admin', 'principal'),
  validateRequest(createSectionSchema),
  createSection
);

// ─── Subjects & Subject Allocations ──────────────────────────────────────────
router.post(
  '/subjects',
  authenticate,
  authorize('super_admin', 'principal'),
  validateRequest(createSubjectSchema),
  createSubject
);

router.get(
  '/subjects',
  authenticate,
  getSubjects
);

router.post(
  '/class-subjects',
  authenticate,
  authorize('super_admin', 'principal'),
  validateRequest(assignSubjectSchema),
  assignSubjectToClass
);

router.get(
  '/classes/:classId/subjects',
  authenticate,
  getClassSubjects
);

export default router;
