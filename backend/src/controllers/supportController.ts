import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';
import { createNotification, broadcastRoleNotification } from '../utils/notification';

const STAFF_ROLES = ['super_admin', 'principal', 'office_staff'];

/**
 * GET /api/v1/support/faqs
 * Retrieve published FAQs, optionally filtered by category
 */
export const getFaqs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.query;

    let query = 'SELECT * FROM faqs WHERE is_published = TRUE';
    const params: any[] = [];

    if (category && typeof category === 'string') {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    query += ' ORDER BY display_order ASC, created_at ASC';

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve FAQs' });
  }
};

/**
 * POST /api/v1/support/faqs
 * Admin/Principal create a new FAQ
 */
export const createFaq = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, question, answer, display_order = 0 } = req.body;

    const query = `
      INSERT INTO faqs (category, question, answer, display_order)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await pool.query(query, [category, question, answer, display_order]);

    res.status(201).json({
      success: true,
      message: 'FAQ created successfully',
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error creating FAQ:', error);
    res.status(500).json({ success: false, message: 'Failed to create FAQ' });
  }
};

/**
 * GET /api/v1/support/tickets
 * List support tickets (all for staff, own tickets for students/parents/teachers)
 */
export const getTickets = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;
    const { status, category, priority } = req.query;

    let query = `
      SELECT 
        t.*,
        u.name AS requester_name,
        u.email AS requester_email,
        r.name AS requester_role,
        assigned.name AS assigned_to_name,
        COUNT(tr.id)::int AS reply_count,
        MAX(tr.created_at) AS last_reply_at
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN users assigned ON t.assigned_to = assigned.id
      LEFT JOIN ticket_replies tr ON t.id = tr.ticket_id
      WHERE 1=1
    `;

    const params: any[] = [];

    // Role-based visibility
    if (!STAFF_ROLES.includes(userRole)) {
      params.push(userId);
      query += ` AND t.user_id = $${params.length}`;
    }

    if (status && typeof status === 'string') {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }

    if (category && typeof category === 'string') {
      params.push(category);
      query += ` AND t.category = $${params.length}`;
    }

    if (priority && typeof priority === 'string') {
      params.push(priority);
      query += ` AND t.priority = $${params.length}`;
    }

    query += `
      GROUP BY t.id, u.name, u.email, r.name, assigned.name
      ORDER BY t.created_at DESC
    `;

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve support tickets' });
  }
};

/**
 * POST /api/v1/support/tickets
 * Submit a new support ticket
 */
export const createTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;
    const { subject, category, priority = 'medium', description } = req.body;

    // Generate sequence-based ticket number
    const seqResult = await pool.query("SELECT nextval('support_ticket_seq') AS seq");
    const seq = seqResult.rows[0].seq;
    const ticketNumber = `TIK-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

    const insertQuery = `
      INSERT INTO support_tickets (ticket_number, user_id, subject, category, priority, description, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'open')
      RETURNING *
    `;

    const result = await pool.query(insertQuery, [
      ticketNumber,
      userId,
      subject,
      category,
      priority,
      description
    ]);

    const createdTicket = result.rows[0];

    // Notify office staff and super admins of new ticket
    await broadcastRoleNotification('super_admin', {
      title: 'New Support Ticket Created',
      message: `[${ticketNumber}] ${subject} (${category}) submitted by user.`,
      type: 'system',
      link: '/support'
    });

    // Write audit log
    await createAuditLog({
      userId,
      action: 'ticket_created',
      resource: 'support_ticket',
      resourceId: createdTicket.id,
      newValue: { ticketNumber, category, priority },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(201).json({
      success: true,
      message: 'Support ticket submitted successfully',
      data: createdTicket
    });
  } catch (error: any) {
    console.error('Error submitting support ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to submit support ticket' });
  }
};

/**
 * GET /api/v1/support/tickets/:id
 * Retrieve single ticket details with replies thread
 */
export const getTicketById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;

    // Fetch ticket details
    const ticketQuery = `
      SELECT 
        t.*,
        u.name AS requester_name,
        u.email AS requester_email,
        r.name AS requester_role,
        assigned.name AS assigned_to_name
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN users assigned ON t.assigned_to = assigned.id
      WHERE t.id = $1
    `;
    const ticketResult = await pool.query(ticketQuery, [id]);

    if (ticketResult.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Support ticket not found' });
      return;
    }

    const ticket = ticketResult.rows[0];

    // Access control: only requester or staff can view
    if (!STAFF_ROLES.includes(userRole) && ticket.user_id !== userId) {
      res.status(403).json({ success: false, message: 'Access denied to this ticket' });
      return;
    }

    // Fetch thread replies
    const repliesQuery = `
      SELECT 
        tr.*,
        u.name AS sender_name,
        u.email AS sender_email,
        r.name AS sender_role
      FROM ticket_replies tr
      JOIN users u ON tr.user_id = u.id
      JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
      JOIN roles r ON ur.role_id = r.id
      WHERE tr.ticket_id = $1
      ORDER BY tr.created_at ASC
    `;
    const repliesResult = await pool.query(repliesQuery, [id]);

    res.status(200).json({
      success: true,
      data: {
        ...ticket,
        replies: repliesResult.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching ticket details:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve ticket details' });
  }
};

/**
 * POST /api/v1/support/tickets/:id/reply
 * Post a reply message on a ticket
 */
export const createTicketReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;
    const { message } = req.body;

    // Check ticket existence
    const ticketResult = await pool.query('SELECT * FROM support_tickets WHERE id = $1', [id]);
    if (ticketResult.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Support ticket not found' });
      return;
    }

    const ticket = ticketResult.rows[0];

    // Access control
    if (!STAFF_ROLES.includes(userRole) && ticket.user_id !== userId) {
      res.status(403).json({ success: false, message: 'Access denied to reply to this ticket' });
      return;
    }

    if (ticket.status === 'closed') {
      res.status(400).json({ success: false, message: 'Cannot reply to a closed ticket' });
      return;
    }

    // Insert reply
    const insertReply = `
      INSERT INTO ticket_replies (ticket_id, user_id, message)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const replyResult = await pool.query(insertReply, [id, userId, message]);

    // Touch ticket updated_at
    await pool.query('UPDATE support_tickets SET updated_at = NOW() WHERE id = $1', [id]);

    // Notify ticket owner if replied by staff
    if (STAFF_ROLES.includes(userRole) && ticket.user_id !== userId) {
      await createNotification({
        userId: ticket.user_id,
        title: `Reply on Support Ticket ${ticket.ticket_number}`,
        message: `A staff member replied to your ticket: "${message.slice(0, 100)}..."`,
        type: 'system',
        link: '/support'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Reply posted successfully',
      data: replyResult.rows[0]
    });
  } catch (error: any) {
    console.error('Error posting ticket reply:', error);
    res.status(500).json({ success: false, message: 'Failed to post reply' });
  }
};

/**
 * PATCH /api/v1/support/tickets/:id/status
 * Update ticket status (open, in_progress, resolved, closed)
 */
export const updateTicketStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;
    const { status } = req.body;

    const ticketResult = await pool.query('SELECT * FROM support_tickets WHERE id = $1', [id]);
    if (ticketResult.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Support ticket not found' });
      return;
    }

    const ticket = ticketResult.rows[0];

    // Students/parents/teachers can only close their own tickets
    if (!STAFF_ROLES.includes(userRole)) {
      if (ticket.user_id !== userId || status !== 'closed') {
        res.status(403).json({ success: false, message: 'You can only close your own support tickets' });
        return;
      }
    }

    const isResolvedOrClosed = status === 'resolved' || status === 'closed';

    const updateQuery = `
      UPDATE support_tickets
      SET 
        status = $1,
        resolved_at = CASE WHEN $2 = TRUE THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [status, isResolvedOrClosed, id]);

    // Notify owner if status changed by staff
    if (STAFF_ROLES.includes(userRole) && ticket.user_id !== userId) {
      await createNotification({
        userId: ticket.user_id,
        title: `Support Ticket ${ticket.ticket_number} Updated`,
        message: `Your ticket status has been changed to "${status}".`,
        type: 'system',
        link: '/support'
      });
    }

    // Write audit log
    await createAuditLog({
      userId,
      action: 'ticket_status_updated',
      resource: 'support_ticket',
      resourceId: id,
      oldValue: { status: ticket.status },
      newValue: { status },
      ipAddress: req.ip || '127.0.0.1'
    });

    res.status(200).json({
      success: true,
      message: `Ticket status updated to ${status}`,
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ success: false, message: 'Failed to update ticket status' });
  }
};

/**
 * GET /api/v1/support/system-status
 * Platform health, database connection state, and uptime
 */
export const getSystemStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    const dbLatencyMs = Date.now() - dbStart;

    const uptimeSeconds = Math.floor(process.uptime());
    const days = Math.floor(uptimeSeconds / (3600 * 24));
    const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    const memoryUsage = process.memoryUsage();

    res.status(200).json({
      success: true,
      data: {
        status: 'operational',
        timestamp: new Date().toISOString(),
        database: {
          status: 'connected',
          latencyMs: dbLatencyMs
        },
        server: {
          uptime: `${days}d ${hours}h ${minutes}m`,
          uptimeSeconds,
          nodeVersion: process.version,
          memoryUsage: {
            heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            rssMB: Math.round(memoryUsage.rss / 1024 / 1024)
          }
        },
        services: [
          { name: 'Authentication & RBAC', status: 'operational' },
          { name: 'PostgreSQL Database Engine', status: 'operational' },
          { name: 'In-App Notification Engine', status: 'operational' },
          { name: 'Document Storage Subsystem', status: 'operational' },
          { name: 'Academic & Timetable Engine', status: 'operational' }
        ]
      }
    });
  } catch (error: any) {
    console.error('Error checking system status:', error);
    res.status(500).json({
      success: false,
      message: 'System status check failed',
      data: {
        status: 'degraded',
        database: { status: 'disconnected', error: error.message }
      }
    });
  }
};
