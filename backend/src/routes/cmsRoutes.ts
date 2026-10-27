import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest, validateUUIDParam } from '../middlewares/validate';
import {
  createPageSchema,
  updatePageSchema,
  submitInquirySchema,
  updateInquiryStatusSchema
} from '../validators/cmsValidator';
import {
  getPages,
  getPageBySlug,
  createPage,
  updatePage,
  deletePage,
  submitInquiry,
  getInquiries,
  updateInquiryStatus
} from '../controllers/cmsController';

const router = Router();

// ─── Public Website Endpoints ────────────────────────────────────────────────
router.get('/pages', getPages);
router.get('/pages/:slug', getPageBySlug);
router.post('/inquiries', validateRequest(submitInquirySchema), submitInquiry);

// ─── Protected Management Endpoints ──────────────────────────────────────────
router.use(authenticate);

// Custom CMS Pages
router.post('/pages', authorize('super_admin', 'principal'), validateRequest(createPageSchema), createPage);
router.put('/pages/:slug', authorize('super_admin', 'principal'), validateRequest(updatePageSchema), updatePage);
router.delete('/pages/:slug', authorize('super_admin'), deletePage);

// Admissions & General Inquiries
router.get('/inquiries', authorize('super_admin', 'principal', 'office_staff'), getInquiries);
router.patch(
  '/inquiries/:id',
  authorize('super_admin', 'principal', 'office_staff'),
  validateUUIDParam('id'),
  validateRequest(updateInquiryStatusSchema),
  updateInquiryStatus
);

export default router;
