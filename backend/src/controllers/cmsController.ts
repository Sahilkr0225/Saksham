import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';
import { broadcastRoleNotification } from '../utils/notification';

const STAFF_ROLES = ['super_admin', 'principal', 'office_staff'];

/**
 * GET /api/v1/cms/pages
 * List CMS pages (published only for public; all for staff)
 */
export const getPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userRole = (req as any).user?.role;
    let query = 'SELECT id, slug, title, is_published, updated_at FROM cms_pages';

    if (!userRole || !STAFF_ROLES.includes(userRole)) {
      query += ' WHERE is_published = TRUE';
    }

    query += ' ORDER BY title ASC';
    const result = await pool.query(query);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching CMS pages:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve pages' });
  }
};

/**
 * GET /api/v1/cms/pages/:slug
 * Retrieve single page content by slug
 */
export const getPageBySlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const userRole = (req as any).user?.role;

    const result = await pool.query('SELECT * FROM cms_pages WHERE slug = $1', [slug]);

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'CMS page not found' });
      return;
    }

    const page = result.rows[0];

    if (!page.is_published && (!userRole || !STAFF_ROLES.includes(userRole))) {
      res.status(403).json({ success: false, message: 'Page is not published' });
      return;
    }

    res.status(200).json({
      success: true,
      data: page
    });
  } catch (error: any) {
    console.error('Error fetching CMS page:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve page' });
  }
};

/**
 * POST /api/v1/cms/pages
 * Create new CMS page (Admin / Principal)
 */
export const createPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { slug, title, content_json = {}, is_published = true } = req.body;

    // Check slug collision
    const existing = await pool.query('SELECT 1 FROM cms_pages WHERE slug = $1', [slug]);
    if ((existing.rowCount ?? 0) > 0) {
      res.status(409).json({ success: false, message: `Page with slug '${slug}' already exists` });
      return;
    }

    const insertQuery = `
      INSERT INTO cms_pages (slug, title, content_json, is_published, updated_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      slug,
      title,
      JSON.stringify(content_json),
      is_published,
      userId
    ]);

    const createdPage = result.rows[0];

    await createAuditLog({
      userId,
      action: 'cms_page_created',
      resource: 'cms_page',
      resourceId: createdPage.id,
      newValue: { slug, title, is_published },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(201).json({
      success: true,
      message: 'Page created successfully',
      data: createdPage
    });
  } catch (error: any) {
    console.error('Error creating CMS page:', error);
    res.status(500).json({ success: false, message: 'Failed to create page' });
  }
};

/**
 * PUT /api/v1/cms/pages/:slug
 * Update CMS page content and metadata
 */
export const updatePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const userId = (req as any).user?.userId;

    const existingRes = await pool.query('SELECT * FROM cms_pages WHERE slug = $1', [slug]);
    if (existingRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'CMS page not found' });
      return;
    }

    const page = existingRes.rows[0];
    const {
      title = page.title,
      content_json = page.content_json,
      is_published = page.is_published
    } = req.body;

    const updateQuery = `
      UPDATE cms_pages
      SET title = $1, content_json = $2, is_published = $3, updated_by = $4, updated_at = NOW()
      WHERE slug = $5
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      title,
      JSON.stringify(content_json),
      is_published,
      userId,
      slug
    ]);

    await createAuditLog({
      userId,
      action: 'cms_page_updated',
      resource: 'cms_page',
      resourceId: page.id,
      oldValue: { title: page.title, is_published: page.is_published },
      newValue: { title, is_published },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: 'Page updated successfully',
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error updating CMS page:', error);
    res.status(500).json({ success: false, message: 'Failed to update page' });
  }
};

/**
 * DELETE /api/v1/cms/pages/:slug
 * Delete a custom CMS page
 */
export const deletePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { slug } = req.params;
    const userId = (req as any).user?.userId;

    const existingRes = await pool.query('SELECT * FROM cms_pages WHERE slug = $1', [slug]);
    if (existingRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'CMS page not found' });
      return;
    }

    await pool.query('DELETE FROM cms_pages WHERE slug = $1', [slug]);

    await createAuditLog({
      userId,
      action: 'cms_page_deleted',
      resource: 'cms_page',
      resourceId: existingRes.rows[0].id,
      oldValue: { slug, title: existingRes.rows[0].title },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: 'Page deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting CMS page:', error);
    res.status(500).json({ success: false, message: 'Failed to delete page' });
  }
};

/**
 * POST /api/v1/cms/inquiries
 * Public submission of inquiry or admission interest form
 */
export const submitInquiry = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, phone = '', subject, message } = req.body;

    const insertQuery = `
      INSERT INTO cms_inquiries (name, email, phone, subject, message, status)
      VALUES ($1, $2, $3, $4, $5, 'new')
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [name, email, phone, subject, message]);
    const createdInquiry = result.rows[0];

    // Notify office staff of new incoming admission / general inquiry
    await broadcastRoleNotification('office_staff', {
      title: 'New Public Website Inquiry',
      message: `[${subject}] from ${name} (${email})`,
      type: 'admission',
      link: '/admissions'
    });

    res.status(201).json({
      success: true,
      message: 'Thank you for contacting us. Our admissions and academic team will get in touch shortly.',
      data: {
        id: createdInquiry.id,
        created_at: createdInquiry.created_at
      }
    });
  } catch (error: any) {
    console.error('Error submitting inquiry:', error);
    res.status(500).json({ success: false, message: 'Failed to submit inquiry' });
  }
};

/**
 * GET /api/v1/cms/inquiries
 * List incoming inquiries for administrative staff
 */
export const getInquiries = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;

    let query = 'SELECT * FROM cms_inquiries WHERE 1=1';
    const params: any[] = [];

    if (status && typeof status === 'string' && status !== 'all') {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching inquiries:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve inquiries' });
  }
};

/**
 * PATCH /api/v1/cms/inquiries/:id
 * Update inquiry status (contacted, resolved, archived) and notes
 */
export const updateInquiryStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const { status, notes = '' } = req.body;

    const existingRes = await pool.query('SELECT * FROM cms_inquiries WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Inquiry not found' });
      return;
    }

    const inquiry = existingRes.rows[0];

    const updateQuery = `
      UPDATE cms_inquiries
      SET status = $1, notes = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [status, notes, id]);

    await createAuditLog({
      userId,
      action: 'inquiry_status_updated',
      resource: 'cms_inquiry',
      resourceId: id,
      oldValue: { status: inquiry.status },
      newValue: { status, notes },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: `Inquiry marked as ${status}`,
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error updating inquiry status:', error);
    res.status(500).json({ success: false, message: 'Failed to update inquiry status' });
  }
};
