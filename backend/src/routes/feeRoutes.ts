import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import {
  createFeeStructureSchema,
  updateFeeStructureSchema,
  addComponentSchema,
  updateComponentSchema,
  assignFeeSchema,
  recordPaymentSchema,
} from '../validators/feeValidator';
import {
  createFeeStructure,
  listFeeStructures,
  getFeeStructureById,
  updateFeeStructure,
  addFeeComponent,
  updateFeeComponent,
  deleteFeeComponent,
  assignFeeToStudent,
  getStudentFeeSummary,
  recordPayment,
  getReceipt,
  getPendingDues,
  getOverdueDues,
  getUpcomingDueReminders,
  getOverdueReminders,
  getAnalyticsSummary,
} from '../controllers/feeController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Fee Structures ────────────────────────────────────────────────────────────
router.post(
  '/structures',
  authorize('super_admin', 'office_staff'),
  validateRequest(createFeeStructureSchema),
  createFeeStructure
);
router.get(
  '/structures',
  authorize('super_admin', 'principal', 'office_staff'),
  listFeeStructures
);
router.get(
  '/structures/:id',
  authorize('super_admin', 'principal', 'office_staff'),
  getFeeStructureById
);
router.patch(
  '/structures/:id',
  authorize('super_admin', 'office_staff'),
  validateRequest(updateFeeStructureSchema),
  updateFeeStructure
);

// ── Fee Components ────────────────────────────────────────────────────────────
router.post(
  '/structures/:id/components',
  authorize('super_admin', 'office_staff'),
  validateRequest(addComponentSchema),
  addFeeComponent
);
router.patch(
  '/components/:componentId',
  authorize('super_admin', 'office_staff'),
  validateRequest(updateComponentSchema),
  updateFeeComponent
);
router.delete(
  '/components/:componentId',
  authorize('super_admin', 'office_staff'),
  deleteFeeComponent
);

// ── Student Fee Assignment ────────────────────────────────────────────────────
router.post(
  '/assign',
  authorize('super_admin', 'office_staff'),
  validateRequest(assignFeeSchema),
  assignFeeToStudent
);

// ── Student Fee Summary (role-guarded internally) ─────────────────────────────
router.get(
  '/student/:studentId',
  authorize('super_admin', 'principal', 'office_staff', 'parent', 'student'),
  getStudentFeeSummary
);

// ── Payments ──────────────────────────────────────────────────────────────────
router.post(
  '/payments',
  authorize('super_admin', 'office_staff'),
  validateRequest(recordPaymentSchema),
  recordPayment
);

// ── Receipts ──────────────────────────────────────────────────────────────────
router.get(
  '/receipts/:paymentId',
  authorize('super_admin', 'principal', 'office_staff', 'parent', 'student'),
  getReceipt
);

// ── Dues ──────────────────────────────────────────────────────────────────────
router.get(
  '/dues/pending',
  authorize('super_admin', 'principal', 'office_staff'),
  getPendingDues
);
router.get(
  '/dues/overdue',
  authorize('super_admin', 'principal', 'office_staff'),
  getOverdueDues
);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get(
  '/notifications/upcoming',
  authorize('super_admin', 'principal', 'office_staff'),
  getUpcomingDueReminders
);
router.get(
  '/notifications/overdue',
  authorize('super_admin', 'principal', 'office_staff'),
  getOverdueReminders
);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get(
  '/analytics/summary',
  authorize('super_admin', 'principal', 'office_staff'),
  getAnalyticsSummary
);

export default router;
