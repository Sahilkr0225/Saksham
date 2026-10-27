import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest, validateUUIDParam } from '../middlewares/validate';
import { uploadDocumentSchema, verifyDocumentSchema } from '../validators/documentValidator';
import {
  uploadDocument,
  getDocuments,
  getDocumentById,
  downloadDocument,
  verifyDocument,
  deleteDocument
} from '../controllers/documentController';

const router = Router();

// All document operations require authentication
router.use(authenticate);

// List documents
router.get('/', getDocuments);

// Upload document
router.post('/', validateRequest(uploadDocumentSchema), uploadDocument);

// Get single document details
router.get('/:id', validateUUIDParam('id'), getDocumentById);

// Download file stream
router.get('/:id/download', validateUUIDParam('id'), downloadDocument);

// Verify or reject document (Admin / Office Staff only)
router.patch(
  '/:id/verify',
  authorize('super_admin', 'principal', 'office_staff'),
  validateUUIDParam('id'),
  validateRequest(verifyDocumentSchema),
  verifyDocument
);

// Delete document
router.delete('/:id', validateUUIDParam('id'), deleteDocument);

export default router;
