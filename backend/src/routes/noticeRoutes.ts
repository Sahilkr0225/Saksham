import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest } from '../middlewares/validate';
import {
  createNoticeSchema,
  updateNoticeSchema,
  createEventSchema,
  updateEventSchema,
} from '../validators/noticeValidator';
import {
  createNotice,
  getAllNotices,
  getMyNotices,
  getNoticeById,
  updateNotice,
  deleteNotice,
  pinNotice,
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent
} from '../controllers/noticeController';

const router = Router();
router.use(authenticate);

// ─── Notices ─────────────────────────────────────────────────────────────────

// Admin/Teacher APIs
router.post('/', authorize('super_admin', 'principal', 'office_staff', 'teacher'), validateRequest(createNoticeSchema), createNotice);
router.get('/', authorize('super_admin', 'principal', 'office_staff', 'teacher'), getAllNotices);
router.patch('/:id', authorize('super_admin', 'principal', 'office_staff', 'teacher'), validateRequest(updateNoticeSchema), updateNotice);
router.delete('/:id', authorize('super_admin', 'principal', 'office_staff', 'teacher'), deleteNotice);
router.patch('/:id/pin', authorize('super_admin', 'principal'), pinNotice);

// Filtered API for Students and Parents
router.get('/my', authorize('student', 'parent'), getMyNotices);

// Common read by ID for notices is moved to bottom to avoid swallowing /events

// ─── Events ──────────────────────────────────────────────────────────────────

router.post('/events', authorize('super_admin', 'principal', 'office_staff'), validateRequest(createEventSchema), createEvent);
router.get('/events', getEvents); // Open to all authenticated users
router.get('/events/:id', getEventById);
router.patch('/events/:id', authorize('super_admin', 'principal', 'office_staff'), validateRequest(updateEventSchema), updateEvent);
router.delete('/events/:id', authorize('super_admin', 'principal', 'office_staff'), deleteEvent);

// ─── Shared/Catch-all Dynamic Routes ─────────────────────────────────────────

// Common read by ID for Notices
router.get('/:id', getNoticeById);

export default router;
