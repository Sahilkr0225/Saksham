import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

const GALLERY_DIR = path.join(process.cwd(), 'uploads', 'gallery');

// Ensure gallery upload directory exists
if (!fs.existsSync(GALLERY_DIR)) {
  fs.mkdirSync(GALLERY_DIR, { recursive: true });
}

const STAFF_ROLES = ['super_admin', 'principal', 'teacher', 'office_staff'];

/**
 * GET /api/v1/gallery/albums
 * Retrieve list of albums with media count
 */
export const getAlbums = async (req: Request, res: Response): Promise<void> => {
  try {
    const userRole = (req as any).user?.role;
    const { category } = req.query;

    let query = `
      SELECT 
        a.*,
        u.name AS creator_name,
        COUNT(m.id)::int AS media_count,
        MAX(m.created_at) AS last_media_at
      FROM gallery_albums a
      JOIN users u ON a.created_by = u.id
      LEFT JOIN gallery_media m ON a.id = m.album_id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Students, parents, and unauthenticated public only see public albums
    if (!userRole || !STAFF_ROLES.includes(userRole)) {
      query += ' AND a.is_public = TRUE';
    }

    if (category && typeof category === 'string' && category !== 'all') {
      params.push(category);
      query += ` AND a.category = $${params.length}`;
    }

    query += `
      GROUP BY a.id, u.name
      ORDER BY a.created_at DESC
    `;

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching gallery albums:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve albums' });
  }
};

/**
 * GET /api/v1/gallery/albums/:id
 * Retrieve single album and its media photos
 */
export const getAlbumById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userRole = (req as any).user?.role;

    const albumQuery = `
      SELECT a.*, u.name AS creator_name
      FROM gallery_albums a
      JOIN users u ON a.created_by = u.id
      WHERE a.id = $1
    `;
    const albumRes = await pool.query(albumQuery, [id]);

    if (albumRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Album not found' });
      return;
    }

    const album = albumRes.rows[0];

    // Access check for private albums
    if (!album.is_public && (!userRole || !STAFF_ROLES.includes(userRole))) {
      res.status(403).json({ success: false, message: 'Access denied to private album' });
      return;
    }

    const mediaQuery = `
      SELECT 
        id, album_id, title, caption, media_type, file_name, file_size, mime_type, created_at,
        CONCAT('/api/v1/gallery/media/', id, '/file') AS url
      FROM gallery_media
      WHERE album_id = $1
      ORDER BY created_at ASC
    `;
    const mediaRes = await pool.query(mediaQuery, [id]);

    res.status(200).json({
      success: true,
      data: {
        ...album,
        media: mediaRes.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching album details:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve album details' });
  }
};

/**
 * POST /api/v1/gallery/albums
 * Create a new gallery album (Staff only)
 */
export const createAlbum = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { title, description = '', cover_image_url = '', is_public = true, category = 'events' } = req.body;

    const insertQuery = `
      INSERT INTO gallery_albums (title, description, cover_image_url, is_public, category, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      title,
      description,
      cover_image_url,
      is_public,
      category,
      userId
    ]);

    const createdAlbum = result.rows[0];

    await createAuditLog({
      userId,
      action: 'gallery_album_created',
      resource: 'gallery_album',
      resourceId: createdAlbum.id,
      newValue: { title, category, is_public },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(201).json({
      success: true,
      message: 'Album created successfully',
      data: createdAlbum
    });
  } catch (error: any) {
    console.error('Error creating album:', error);
    res.status(500).json({ success: false, message: 'Failed to create album' });
  }
};

/**
 * PATCH /api/v1/gallery/albums/:id
 * Update album metadata
 */
export const updateAlbum = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;

    const existingRes = await pool.query('SELECT * FROM gallery_albums WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Album not found' });
      return;
    }

    const album = existingRes.rows[0];

    // Creator or admin/principal
    if (!['super_admin', 'principal'].includes(userRole) && album.created_by !== userId) {
      res.status(403).json({ success: false, message: 'Access denied to edit this album' });
      return;
    }

    const {
      title = album.title,
      description = album.description,
      cover_image_url = album.cover_image_url,
      is_public = album.is_public,
      category = album.category
    } = req.body;

    const updateQuery = `
      UPDATE gallery_albums
      SET title = $1, description = $2, cover_image_url = $3, is_public = $4, category = $5, updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      title,
      description,
      cover_image_url,
      is_public,
      category,
      id
    ]);

    await createAuditLog({
      userId,
      action: 'gallery_album_updated',
      resource: 'gallery_album',
      resourceId: id,
      oldValue: { title: album.title, is_public: album.is_public },
      newValue: { title, is_public },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: 'Album updated successfully',
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error updating album:', error);
    res.status(500).json({ success: false, message: 'Failed to update album' });
  }
};

/**
 * DELETE /api/v1/gallery/albums/:id
 * Delete album and delete all media files on disk
 */
export const deleteAlbum = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;

    const albumRes = await pool.query('SELECT * FROM gallery_albums WHERE id = $1', [id]);
    if (albumRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Album not found' });
      return;
    }

    const album = albumRes.rows[0];

    if (!['super_admin', 'principal'].includes(userRole) && album.created_by !== userId) {
      res.status(403).json({ success: false, message: 'Access denied to delete this album' });
      return;
    }

    // Fetch media files to delete from disk
    const mediaRes = await pool.query('SELECT file_path FROM gallery_media WHERE album_id = $1', [id]);
    for (const row of mediaRes.rows) {
      try {
        if (fs.existsSync(row.file_path)) {
          fs.unlinkSync(row.file_path);
        }
      } catch (err) {
        console.warn('Could not delete media file:', row.file_path);
      }
    }

    await pool.query('DELETE FROM gallery_albums WHERE id = $1', [id]);

    await createAuditLog({
      userId,
      action: 'gallery_album_deleted',
      resource: 'gallery_album',
      resourceId: id,
      oldValue: { title: album.title },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: 'Album and all associated photos deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting album:', error);
    res.status(500).json({ success: false, message: 'Failed to delete album' });
  }
};

/**
 * POST /api/v1/gallery/media
 * Upload a photo or video to an album
 */
export const uploadMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const {
      album_id,
      title = '',
      caption = '',
      file_name,
      mime_type = 'image/jpeg',
      file_data
    } = req.body;

    // Check album exists
    const albumRes = await pool.query('SELECT * FROM gallery_albums WHERE id = $1', [album_id]);
    if (albumRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Target album not found' });
      return;
    }

    const album = albumRes.rows[0];

    // Decode base64
    const base64Data = file_data.replace(/^data:[^;]+;base64,/, '');
    const fileBuffer = Buffer.from(base64Data, 'base64');
    const fileSize = fileBuffer.length;

    // Save to disk
    const safeFileName = `${crypto.randomUUID()}_${file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(GALLERY_DIR, safeFileName);
    await fs.promises.writeFile(filePath, fileBuffer);

    const mediaType = mime_type.startsWith('video') ? 'video' : 'image';

    const insertQuery = `
      INSERT INTO gallery_media (album_id, title, caption, media_type, file_name, file_path, file_size, mime_type, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      album_id,
      title || file_name,
      caption,
      mediaType,
      file_name,
      filePath,
      fileSize,
      mime_type,
      userId
    ]);

    const createdMedia = result.rows[0];
    const mediaUrl = `/api/v1/gallery/media/${createdMedia.id}/file`;

    // If album has no cover image, automatically set this photo as cover
    if (!album.cover_image_url) {
      await pool.query('UPDATE gallery_albums SET cover_image_url = $1 WHERE id = $2', [mediaUrl, album_id]);
    }

    res.status(201).json({
      success: true,
      message: 'Photo uploaded successfully',
      data: {
        ...createdMedia,
        url: mediaUrl
      }
    });
  } catch (error: any) {
    console.error('Error uploading gallery media:', error);
    res.status(500).json({ success: false, message: 'Failed to upload photo' });
  }
};

/**
 * DELETE /api/v1/gallery/media/:id
 * Delete single photo
 */
export const deleteMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;

    const mediaRes = await pool.query('SELECT * FROM gallery_media WHERE id = $1', [id]);
    if (mediaRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Media item not found' });
      return;
    }

    const media = mediaRes.rows[0];

    if (!['super_admin', 'principal'].includes(userRole) && media.uploaded_by !== userId) {
      res.status(403).json({ success: false, message: 'Access denied to delete this photo' });
      return;
    }

    // Delete disk file
    try {
      if (fs.existsSync(media.file_path)) {
        fs.unlinkSync(media.file_path);
      }
    } catch (err) {
      console.warn('Could not unlink media file:', media.file_path);
    }

    await pool.query('DELETE FROM gallery_media WHERE id = $1', [id]);

    res.status(200).json({
      success: true,
      message: 'Photo removed from album'
    });
  } catch (error: any) {
    console.error('Error deleting media:', error);
    res.status(500).json({ success: false, message: 'Failed to delete photo' });
  }
};

/**
 * GET /api/v1/gallery/media/:id/file
 * Serve image file stream
 */
export const getMediaFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const mediaRes = await pool.query(
      `SELECT m.*, a.is_public 
       FROM gallery_media m
       JOIN gallery_albums a ON m.album_id = a.id
       WHERE m.id = $1`,
      [id]
    );

    if (mediaRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Photo not found' });
      return;
    }

    const media = mediaRes.rows[0];

    if (!fs.existsSync(media.file_path)) {
      res.status(404).json({ success: false, message: 'Media file missing on server disk' });
      return;
    }

    res.setHeader('Content-Type', media.mime_type || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${media.file_name}"`);
    res.sendFile(media.file_path);
  } catch (error: any) {
    console.error('Error serving media file:', error);
    res.status(500).json({ success: false, message: 'Failed to serve media file' });
  }
};
