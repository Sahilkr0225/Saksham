import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';
import { broadcastNotification } from '../utils/notification';

/**
 * GET /api/v1/admin/settings
 * Retrieve school profile and system configuration
 */
export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    let result = await pool.query('SELECT * FROM school_settings LIMIT 1');

    if (result.rowCount === 0) {
      // Seed default settings row if empty
      const insertDefault = `
        INSERT INTO school_settings (school_name, currency)
        VALUES ('Saksham International Academy', 'INR')
        RETURNING *
      `;
      result = await pool.query(insertDefault);
    }

    res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve settings' });
  }
};

/**
 * PUT /api/v1/admin/settings
 * Update school profile and system-wide configurations (super_admin only)
 */
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const {
      school_name,
      affiliation_number,
      address,
      phone,
      email,
      website,
      logo_url,
      motto,
      currency,
      period_duration_minutes,
      attendance_cutoff_time,
      working_days,
      grading_scale
    } = req.body;

    // Fetch existing settings
    let existing = await pool.query('SELECT * FROM school_settings LIMIT 1');
    if (existing.rowCount === 0) {
      await pool.query("INSERT INTO school_settings (school_name) VALUES ('Saksham International Academy')");
      existing = await pool.query('SELECT * FROM school_settings LIMIT 1');
    }
    const settingsId = existing.rows[0].id;
    const oldValues = existing.rows[0];

    const updateQuery = `
      UPDATE school_settings
      SET 
        school_name = COALESCE($1, school_name),
        affiliation_number = COALESCE($2, affiliation_number),
        address = COALESCE($3, address),
        phone = COALESCE($4, phone),
        email = COALESCE($5, email),
        website = COALESCE($6, website),
        logo_url = COALESCE($7, logo_url),
        motto = COALESCE($8, motto),
        currency = COALESCE($9, currency),
        period_duration_minutes = COALESCE($10, period_duration_minutes),
        attendance_cutoff_time = COALESCE($11, attendance_cutoff_time),
        working_days = COALESCE($12, working_days),
        grading_scale = COALESCE($13, grading_scale),
        updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `;

    const result = await pool.query(updateQuery, [
      school_name,
      affiliation_number,
      address,
      phone,
      email,
      website,
      logo_url,
      motto,
      currency,
      period_duration_minutes,
      attendance_cutoff_time,
      working_days ? JSON.stringify(working_days) : null,
      grading_scale ? JSON.stringify(grading_scale) : null,
      settingsId
    ]);

    await createAuditLog({
      userId,
      action: 'UPDATE_SETTINGS',
      resource: 'school_settings',
      resourceId: settingsId,
      oldValue: oldValues,
      newValue: result.rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(200).json({
      success: true,
      message: 'School settings updated successfully',
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

/**
 * POST /api/v1/admin/promote-students
 * Bulk student promotion engine
 */
export const promoteStudents = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const userId = (req as any).user?.userId;
    const { source_class_id, target_class_id, target_section_id, student_ids } = req.body;

    if (source_class_id === target_class_id) {
      res.status(400).json({
        success: false,
        message: 'Source and target classes cannot be the same'
      });
      return;
    }

    await client.query('BEGIN');

    // 1. Verify target class
    const targetClassRes = await client.query('SELECT name FROM classes WHERE id = $1', [target_class_id]);
    if (targetClassRes.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Target class does not exist' });
      return;
    }
    const targetClassName = targetClassRes.rows[0].name;

    // 2. If target_section_id specified, check capacity
    if (target_section_id) {
      const secRes = await client.query(
        'SELECT class_id, capacity FROM sections WHERE id = $1 FOR UPDATE',
        [target_section_id]
      );
      if (secRes.rowCount === 0 || secRes.rows[0].class_id !== target_class_id) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, message: 'Target section does not belong to target class' });
        return;
      }

      const secCapacity = secRes.rows[0].capacity;
      const curCountRes = await client.query(
        "SELECT COUNT(*)::int AS count FROM students WHERE current_section_id = $1 AND status = 'active'",
        [target_section_id]
      );
      const currentEnrolled = curCountRes.rows[0]?.count || 0;

      // Count students to promote
      let promoteCount = 0;
      if (student_ids && student_ids.length > 0) {
        promoteCount = student_ids.length;
      } else {
        const scRes = await client.query(
          "SELECT COUNT(*)::int AS count FROM students WHERE current_class_id = $1 AND status = 'active'",
          [source_class_id]
        );
        promoteCount = scRes.rows[0]?.count || 0;
      }

      if (currentEnrolled + promoteCount > secCapacity) {
        await client.query('ROLLBACK');
        res.status(409).json({
          success: false,
          message: `Target section capacity exceeded (Capacity: ${secCapacity}, Current: ${currentEnrolled}, Incoming: ${promoteCount})`
        });
        return;
      }
    }

    // 3. Perform update
    let updateQuery = `
      UPDATE students
      SET 
        current_class_id = $1,
        current_section_id = $2,
        updated_at = NOW()
      WHERE current_class_id = $3 AND status = 'active'
    `;
    const params: any[] = [target_class_id, target_section_id || null, source_class_id];

    if (student_ids && student_ids.length > 0) {
      updateQuery += ' AND id = ANY($4::uuid[])';
      params.push(student_ids);
    }
    updateQuery += ' RETURNING id, user_id';

    const updateRes = await client.query(updateQuery, params);
    const promotedCount = updateRes.rowCount ?? 0;

    await client.query('COMMIT');

    // 4. Audit Log
    await createAuditLog({
      userId,
      action: 'BULK_PROMOTE_STUDENTS',
      resource: 'students',
      newValue: { source_class_id, target_class_id, target_section_id, promotedCount },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // 5. Notify promoted students
    const studentUserIds = updateRes.rows.map((r) => r.user_id).filter(Boolean);
    if (studentUserIds.length > 0) {
      broadcastNotification({
        userIds: studentUserIds,
        title: 'Promotion Notification',
        message: `Congratulations! You have been successfully promoted to ${targetClassName}.`,
        type: 'system',
        link: '/students'
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully promoted ${promotedCount} student(s) to ${targetClassName}`,
      data: {
        promoted_count: promotedCount,
        target_class: targetClassName
      }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error promoting students:', error);
    res.status(500).json({ success: false, message: 'Failed to promote students' });
  } finally {
    client.release();
  }
};

/**
 * GET /api/v1/admin/backup
 * Download school database snapshot in JSON format (super_admin only)
 */
export const getBackup = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = await pool.query('SELECT * FROM school_settings LIMIT 1');
    const academicYears = await pool.query('SELECT * FROM academic_years ORDER BY start_date DESC');
    const classes = await pool.query('SELECT * FROM classes ORDER BY display_order');
    const sections = await pool.query('SELECT * FROM sections');
    const subjects = await pool.query('SELECT * FROM subjects');

    const counts = await pool.query(`
      SELECT 
        (SELECT COUNT(*)::int FROM students) AS total_students,
        (SELECT COUNT(*)::int FROM teachers) AS total_teachers,
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM admission_applications) AS total_applications
    `);

    const snapshot = {
      system: 'Saksham School Management Platform',
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      counts: counts.rows[0],
      settings: settings.rows[0] || null,
      academic_years: academicYears.rows,
      classes: classes.rows,
      sections: sections.rows,
      subjects: subjects.rows
    };

    const filename = `saksham_backup_${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(JSON.stringify(snapshot, null, 2));
  } catch (error: any) {
    console.error('Error generating backup:', error);
    res.status(500).json({ success: false, message: 'Failed to generate backup' });
  }
};
