import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';
import { createNotification, broadcastRoleNotification } from '../utils/notification';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'documents');

// Ensure upload directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── Authorization Helper ───────────────────────────────────────────────────

const canAccessEntity = async (
  userId: string,
  userRole: string,
  entityType: string,
  entityId: string
): Promise<boolean> => {
  if (['super_admin', 'principal', 'office_staff'].includes(userRole)) {
    return true;
  }

  if (entityType === 'student') {
    if (userRole === 'student') {
      const studentRes = await pool.query(
        'SELECT 1 FROM students WHERE id = $1 AND user_id = $2',
        [entityId, userId]
      );
      return (studentRes.rowCount ?? 0) > 0;
    }
    if (userRole === 'parent') {
      const parentRes = await pool.query(
        'SELECT 1 FROM students WHERE id = $1 AND parent_user_id = $2',
        [entityId, userId]
      );
      return (parentRes.rowCount ?? 0) > 0;
    }
    if (userRole === 'teacher') {
      // Teachers can view students in classes they teach
      const teacherRes = await pool.query(
        `SELECT 1 FROM class_subjects cs
         JOIN students s ON s.current_class_id = cs.class_id
         WHERE s.id = $1 AND cs.teacher_id = $2`,
        [entityId, userId]
      );
      return (teacherRes.rowCount ?? 0) > 0;
    }
  }

  if (entityType === 'teacher') {
    if (userRole === 'teacher') {
      const teacherRes = await pool.query(
        'SELECT 1 FROM teachers WHERE id = $1 AND user_id = $2',
        [entityId, userId]
      );
      return (teacherRes.rowCount ?? 0) > 0;
    }
  }

  return false;
};

// ─── Controllers ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/documents
 * Upload document with base64 payload
 */
export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();
    const { entity_type, entity_id, document_type, title, file_name, file_data, mime_type } = req.body;

    // Check entity access
    const hasAccess = await canAccessEntity(userId, userRole, entity_type, entity_id);
    if (!hasAccess) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to upload documents for this entity'
      });
      return;
    }

    // Decode base64 file data
    const base64Data = file_data.replace(/^data:[^;]+;base64,/, '');
    const fileBuffer = Buffer.from(base64Data, 'base64');
    const fileSize = fileBuffer.length;

    if (fileSize > 10 * 1024 * 1024) {
      res.status(400).json({
        success: false,
        message: 'File size exceeds 10MB limit'
      });
      return;
    }

    // Generate unique file path
    const sanitizedFileName = file_name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const diskFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${sanitizedFileName}`;
    const diskFilePath = path.join(UPLOADS_DIR, diskFileName);

    await fs.promises.writeFile(diskFilePath, fileBuffer);

    // Save record to database
    const insertQuery = `
      INSERT INTO documents (
        entity_type, entity_id, document_type, title, file_name,
        file_path, file_size, mime_type, status, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      entity_type,
      entity_id,
      document_type,
      title,
      file_name,
      diskFilePath,
      fileSize,
      mime_type || 'application/octet-stream',
      userId
    ]);

    const createdDoc = result.rows[0];

    // Audit log
    await createAuditLog({
      userId,
      action: 'UPLOAD_DOCUMENT',
      resource: 'documents',
      resourceId: createdDoc.id,
      newValue: { title, entity_type, entity_id, document_type, file_name, file_size: fileSize },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Notify office staff if uploaded by non-admin
    if (!['super_admin', 'principal', 'office_staff'].includes(userRole)) {
      broadcastRoleNotification('office_staff', {
        title: 'New Document Pending Verification',
        message: `A new ${document_type.replace('_', ' ')} ("${title}") was uploaded and requires verification.`,
        type: 'document',
        link: '/students'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully and queued for verification',
      data: createdDoc
    });
  } catch (error: any) {
    console.error('Error uploading document:', error);
    res.status(500).json({ success: false, message: 'Failed to upload document' });
  }
};

/**
 * GET /api/v1/documents
 * List documents with filtering and role scoping
 */
export const getDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();
    const { entity_type, entity_id, status, document_type, search } = req.query as Record<string, string>;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    // Role-based visibility scoping
    if (userRole === 'student') {
      const studentRes = await pool.query('SELECT id FROM students WHERE user_id = $1', [userId]);
      const studentId = studentRes.rows[0]?.id;
      if (!studentId) {
        res.status(200).json({ success: true, data: [], pagination: { total: 0, page, limit, total_pages: 1 } });
        return;
      }
      conditions.push(`(d.entity_type = 'student' AND d.entity_id = $${pIdx})`);
      params.push(studentId);
      pIdx++;
    } else if (userRole === 'parent') {
      const wardsRes = await pool.query('SELECT id FROM students WHERE parent_user_id = $1', [userId]);
      const wardIds = wardsRes.rows.map((r: any) => r.id);
      if (wardIds.length === 0) {
        res.status(200).json({ success: true, data: [], pagination: { total: 0, page, limit, total_pages: 1 } });
        return;
      }
      conditions.push(`(d.entity_type = 'student' AND d.entity_id = ANY($${pIdx}::uuid[]))`);
      params.push(wardIds);
      pIdx++;
    } else if (userRole === 'teacher') {
      const teacherRes = await pool.query('SELECT id FROM teachers WHERE user_id = $1', [userId]);
      const teacherId = teacherRes.rows[0]?.id;
      conditions.push(`(
        (d.entity_type = 'teacher' AND d.entity_id = $${pIdx}) OR
        d.uploaded_by = $${pIdx + 1}
      )`);
      params.push(teacherId || '00000000-0000-0000-0000-000000000000', userId);
      pIdx += 2;
    }

    if (entity_type) {
      conditions.push(`d.entity_type = $${pIdx}`);
      params.push(entity_type);
      pIdx++;
    }

    if (entity_id) {
      conditions.push(`d.entity_id = $${pIdx}`);
      params.push(entity_id);
      pIdx++;
    }

    if (status) {
      conditions.push(`d.status = $${pIdx}`);
      params.push(status);
      pIdx++;
    }

    if (document_type) {
      conditions.push(`d.document_type = $${pIdx}`);
      params.push(document_type);
      pIdx++;
    }

    if (search) {
      conditions.push(`(d.title ILIKE $${pIdx} OR d.file_name ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count
    const countQuery = `SELECT COUNT(*)::int AS total FROM documents d ${whereClause}`;
    const countRes = await pool.query(countQuery, params);
    const total = countRes.rows[0]?.total || 0;

    // Data query
    const dataQuery = `
      SELECT 
        d.id,
        d.entity_type,
        d.entity_id,
        d.document_type,
        d.title,
        d.file_name,
        d.file_size,
        d.mime_type,
        d.status,
        d.verification_remarks,
        d.verified_at,
        d.created_at,
        d.updated_at,
        u_up.name AS uploader_name,
        u_ver.name AS verifier_name
      FROM documents d
      LEFT JOIN users u_up ON d.uploaded_by = u_up.id
      LEFT JOIN users u_ver ON d.verified_by = u_ver.id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;
    params.push(limit, offset);

    const result = await pool.query(dataQuery, params);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch documents' });
  }
};

/**
 * GET /api/v1/documents/:id
 * Retrieve single document details
 */
export const getDocumentById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();
    const { id } = req.params;

    const query = `
      SELECT 
        d.id,
        d.entity_type,
        d.entity_id,
        d.document_type,
        d.title,
        d.file_name,
        d.file_size,
        d.mime_type,
        d.status,
        d.verification_remarks,
        d.verified_at,
        d.created_at,
        d.updated_at,
        d.uploaded_by,
        u_up.name AS uploader_name,
        u_ver.name AS verifier_name
      FROM documents d
      LEFT JOIN users u_up ON d.uploaded_by = u_up.id
      LEFT JOIN users u_ver ON d.verified_by = u_ver.id
      WHERE d.id = $1
    `;

    const result = await pool.query(query, [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    const doc = result.rows[0];
    const hasAccess = await canAccessEntity(userId, userRole, doc.entity_type, doc.entity_id);
    if (!hasAccess && doc.uploaded_by !== userId) {
      res.status(403).json({ success: false, message: 'Forbidden: Access denied to this document' });
      return;
    }

    res.status(200).json({ success: true, data: doc });
  } catch (error: any) {
    console.error('Error fetching document details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch document' });
  }
};

/**
 * GET /api/v1/documents/:id/download
 * Download file contents securely
 */
export const downloadDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();
    const { id } = req.params;

    const result = await pool.query(
      'SELECT id, entity_type, entity_id, uploaded_by, file_name, file_path, mime_type FROM documents WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    const doc = result.rows[0];
    const hasAccess = await canAccessEntity(userId, userRole, doc.entity_type, doc.entity_id);
    if (!hasAccess && doc.uploaded_by !== userId) {
      res.status(403).json({ success: false, message: 'Forbidden: Cannot download this document' });
      return;
    }

    if (!fs.existsSync(doc.file_path)) {
      res.status(404).json({ success: false, message: 'Physical file missing from storage' });
      return;
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`);
    const fileStream = fs.createReadStream(doc.file_path);
    fileStream.pipe(res);
  } catch (error: any) {
    console.error('Error downloading document:', error);
    res.status(500).json({ success: false, message: 'Failed to download document' });
  }
};

/**
 * PATCH /api/v1/documents/:id/verify
 * Verification / Rejection workflow (restricted to super_admin, principal, office_staff)
 */
export const verifyDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;
    const { status, remarks } = req.body;

    const result = await pool.query(
      `UPDATE documents
       SET status = $1,
           verification_remarks = $2,
           verified_by = $3,
           verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, remarks || null, userId, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    const updatedDoc = result.rows[0];

    // Audit log
    await createAuditLog({
      userId,
      action: 'VERIFY_DOCUMENT',
      resource: 'documents',
      resourceId: id,
      newValue: { status, remarks },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Notify the document uploader of status outcome
    await createNotification({
      userId: updatedDoc.uploaded_by,
      title: `Document ${status === 'verified' ? 'Verified' : 'Rejected'}`,
      message: status === 'verified'
        ? `Your document "${updatedDoc.title}" has been verified successfully.`
        : `Your document "${updatedDoc.title}" was rejected. Reason: ${remarks || 'Verification criteria not met.'}`,
      type: 'document',
      link: '/students'
    });

    res.status(200).json({
      success: true,
      message: `Document has been ${status}`,
      data: updatedDoc
    });
  } catch (error: any) {
    console.error('Error verifying document:', error);
    res.status(500).json({ success: false, message: 'Failed to update document verification' });
  }
};

/**
 * DELETE /api/v1/documents/:id
 * Delete document
 */
export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();
    const { id } = req.params;

    const checkRes = await pool.query(
      'SELECT id, uploaded_by, status, file_path, title FROM documents WHERE id = $1',
      [id]
    );

    if (checkRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    const doc = checkRes.rows[0];

    // Only super_admin or principal can delete any document; uploader can delete only if pending
    const canDelete =
      ['super_admin', 'principal'].includes(userRole) ||
      (doc.uploaded_by === userId && doc.status === 'pending');

    if (!canDelete) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You cannot delete verified/rejected documents or documents uploaded by others'
      });
      return;
    }

    // Delete database record
    await pool.query('DELETE FROM documents WHERE id = $1', [id]);

    // Delete file from disk if exists
    if (fs.existsSync(doc.file_path)) {
      try {
        await fs.promises.unlink(doc.file_path);
      } catch (e) {
        console.warn('Failed to delete physical file:', e);
      }
    }

    await createAuditLog({
      userId,
      action: 'DELETE_DOCUMENT',
      resource: 'documents',
      resourceId: id,
      oldValue: { title: doc.title, status: doc.status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    res.status(500).json({ success: false, message: 'Failed to delete document' });
  }
};
