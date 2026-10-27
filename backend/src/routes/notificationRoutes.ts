import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest, validateUUIDParam } from '../middlewares/validate';
import { createNotificationSchema } from '../validators/notificationValidator';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createManualNotification
} from '../controllers/notificationController';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// Unread count (placed before /:id routes to avoid param collision)
router.get('/unread-count', getUnreadCount);

// Mark all as read (placed before /:id)
router.patch('/mark-all-read', markAllAsRead);

// Paginated notification list
router.get('/', getNotifications);

// Mark individual notification as read
router.patch('/:id/read', validateUUIDParam('id'), markAsRead);

// Delete notification
router.delete('/:id', validateUUIDParam('id'), deleteNotification);

// Manual dispatch / broadcast (restricted to Super Admin & Principal)
router.post(
  '/',
  authorize('super_admin', 'principal'),
  validateRequest(createNotificationSchema),
  createManualNotification
);

export default router;
