import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest, validateUUIDParam } from '../middlewares/validate';
import {
  createFaqSchema,
  createTicketSchema,
  createReplySchema,
  updateTicketStatusSchema
} from '../validators/supportValidator';
import {
  getFaqs,
  createFaq,
  getTickets,
  createTicket,
  getTicketById,
  createTicketReply,
  updateTicketStatus,
  getSystemStatus
} from '../controllers/supportController';

const router = Router();

// Public / Authenticated FAQ listing
router.get('/faqs', getFaqs);

// Protected routes
router.use(authenticate);

// Admin / Principal create FAQ
router.post('/faqs', authorize('super_admin', 'principal'), validateRequest(createFaqSchema), createFaq);

// Support tickets list & create
router.get('/tickets', getTickets);
router.post('/tickets', validateRequest(createTicketSchema), createTicket);

// Single ticket & thread replies
router.get('/tickets/:id', validateUUIDParam('id'), getTicketById);
router.post('/tickets/:id/reply', validateUUIDParam('id'), validateRequest(createReplySchema), createTicketReply);
router.patch('/tickets/:id/status', validateUUIDParam('id'), validateRequest(updateTicketStatusSchema), updateTicketStatus);

// System health and operational status
router.get('/system-status', getSystemStatus);

export default router;
