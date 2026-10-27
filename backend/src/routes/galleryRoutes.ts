import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/rbac';
import { validateRequest, validateUUIDParam } from '../middlewares/validate';
import {
  createAlbumSchema,
  updateAlbumSchema,
  uploadMediaSchema
} from '../validators/galleryValidator';
import {
  getAlbums,
  getAlbumById,
  createAlbum,
  updateAlbum,
  deleteAlbum,
  uploadMedia,
  deleteMedia,
  getMediaFile
} from '../controllers/galleryController';

const router = Router();

// Public media asset streaming (enables standard <img> and <video> browser tags)
router.get('/media/:id/file', validateUUIDParam('id'), getMediaFile);

// All management and directory endpoints require authentication
router.use(authenticate);

// Albums
router.get('/albums', getAlbums);
router.get('/albums/:id', validateUUIDParam('id'), getAlbumById);
router.post(
  '/albums',
  authorize('super_admin', 'principal', 'teacher', 'office_staff'),
  validateRequest(createAlbumSchema),
  createAlbum
);
router.patch(
  '/albums/:id',
  validateUUIDParam('id'),
  validateRequest(updateAlbumSchema),
  updateAlbum
);
router.delete(
  '/albums/:id',
  validateUUIDParam('id'),
  deleteAlbum
);

// Media uploads & deletion
router.post(
  '/media',
  authorize('super_admin', 'principal', 'teacher', 'office_staff'),
  validateRequest(uploadMediaSchema),
  uploadMedia
);
router.delete(
  '/media/:id',
  validateUUIDParam('id'),
  deleteMedia
);

export default router;
