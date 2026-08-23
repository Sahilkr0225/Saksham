import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import { markBulkAttendanceSchema } from '../validators/attendanceValidator';
import { markBulkAttendance, getClassAttendance, getStudentAttendance } from '../controllers/attendanceController';

const router = Router();

// Protect all routes
router.use(authenticate);

// Mark attendance (Teachers, Principals, Super Admins)
router.post(
  '/',
  authorize('super_admin', 'principal', 'teacher'),
  validateRequest(markBulkAttendanceSchema),
  markBulkAttendance
);

// Get class attendance for a specific date
router.get(
  '/class/:classId',
  authorize('super_admin', 'principal', 'teacher'),
  getClassAttendance
);

// Get student's individual attendance profile
router.get(
  '/student/:studentId',
  authorize('super_admin', 'principal', 'teacher', 'parent', 'student'),
  getStudentAttendance
);

export default router;
