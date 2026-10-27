import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import {
  getOverviewReport,
  getAttendanceReport,
  getFeeReport,
  getAcademicReport,
  exportReportCsv
} from '../controllers/reportController';

const router = Router();

// All report routes require authentication
router.use(authenticate);

// Executive KPI overview (Admin, Principal, Staff, Teacher)
router.get('/overview', authorize('super_admin', 'principal', 'office_staff', 'teacher'), getOverviewReport);

// Attendance report & trends
router.get('/attendance', authorize('super_admin', 'principal', 'office_staff', 'teacher'), getAttendanceReport);

// Fee analytics & collections
router.get('/fees', authorize('super_admin', 'principal', 'office_staff'), getFeeReport);

// Academic examination pass rates & averages
router.get('/academics', authorize('super_admin', 'principal', 'teacher'), getAcademicReport);

// CSV export
router.get('/export', authorize('super_admin', 'principal', 'office_staff'), exportReportCsv);

export default router;
