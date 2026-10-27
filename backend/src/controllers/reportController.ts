import { Request, Response } from 'express';
import pool from '../config/db';

/**
 * GET /api/v1/reports/overview
 * Executive school overview with high-level KPIs across all modules
 */
export const getOverviewReport = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Student, Teacher, and Class counts
    const countQuery = `
      SELECT
        (SELECT COUNT(*)::int FROM students WHERE status = 'active') AS total_students,
        (SELECT COUNT(*)::int FROM teachers) AS total_teachers,
        (SELECT COUNT(*)::int FROM classes) AS total_classes,
        (SELECT COUNT(*)::int FROM sections) AS total_sections,
        (SELECT COUNT(*)::int FROM admission_applications WHERE status = 'submitted') AS pending_admissions
    `;
    const countsRes = await pool.query(countQuery);
    const counts = countsRes.rows[0];

    // 2. Attendance 30-day KPI
    const attQuery = `
      SELECT 
        COUNT(*)::int AS total_records,
        COUNT(*) FILTER (WHERE status = 'present')::int AS present_count,
        ROUND((COUNT(*) FILTER (WHERE status = 'present')::numeric / NULLIF(COUNT(*), 0)::numeric) * 100, 1) AS attendance_percentage
      FROM attendance_records
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `;
    const attRes = await pool.query(attQuery);
    const attendanceStats = attRes.rows[0] || { total_records: 0, present_count: 0, attendance_percentage: 0 };

    // 3. Fee Collection Summary
    const feeQuery = `
      SELECT
        COALESCE(SUM(amount_paid), 0)::numeric AS total_collected,
        (SELECT COALESCE(SUM(total_amount), 0)::numeric FROM student_fee_assignments) AS total_assigned
      FROM fee_payments
      WHERE status = 'completed'
    `;
    const feeRes = await pool.query(feeQuery);
    const totalCollected = parseFloat(feeRes.rows[0]?.total_collected || '0');
    const totalAssigned = parseFloat(feeRes.rows[0]?.total_assigned || '0');
    const totalPending = Math.max(0, totalAssigned - totalCollected);
    const collectionRate = totalAssigned > 0 ? Math.round((totalCollected / totalAssigned) * 100) : 0;

    // 4. Document verification summary
    const docQuery = `
      SELECT
        COUNT(*)::int AS total_documents,
        COUNT(*) FILTER (WHERE status = 'verified')::int AS verified_documents,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_documents
      FROM documents
    `;
    const docRes = await pool.query(docQuery);
    const docStats = docRes.rows[0];

    res.status(200).json({
      success: true,
      data: {
        students: {
          active: counts.total_students,
          pending_admissions: counts.pending_admissions
        },
        academics: {
          teachers: counts.total_teachers,
          classes: counts.total_classes,
          sections: counts.total_sections
        },
        attendance: {
          average_rate: parseFloat(attendanceStats.attendance_percentage || '0'),
          total_logged_last_30_days: attendanceStats.total_records
        },
        fees: {
          total_collected: totalCollected,
          total_assigned: totalAssigned,
          total_pending: totalPending,
          collection_rate_percentage: collectionRate
        },
        documents: {
          total: docStats.total_documents,
          verified: docStats.verified_documents,
          pending: docStats.pending_documents
        }
      }
    });
  } catch (error: any) {
    console.error('Error fetching overview report:', error);
    res.status(500).json({ success: false, message: 'Failed to generate overview report' });
  }
};

/**
 * GET /api/v1/reports/attendance
 * Detailed attendance breakdown by class and date range
 */
export const getAttendanceReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { class_id, section_id, start_date, end_date } = req.query as Record<string, string>;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let pIdx = 1;

    if (class_id) {
      conditions.push(`s.current_class_id = $${pIdx++}`);
      params.push(class_id);
    }
    if (section_id) {
      conditions.push(`s.current_section_id = $${pIdx++}`);
      params.push(section_id);
    }
    if (start_date) {
      conditions.push(`a.date >= $${pIdx++}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`a.date <= $${pIdx++}`);
      params.push(end_date);
    }

    const whereClause = conditions.join(' AND ');

    // Class-wise attendance summary
    const classSummaryQuery = `
      SELECT 
        c.name AS class_name,
        sec.name AS section_name,
        COUNT(a.id)::int AS total_marked,
        COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS present_count,
        COUNT(a.id) FILTER (WHERE a.status = 'absent')::int AS absent_count,
        COUNT(a.id) FILTER (WHERE a.status = 'late')::int AS late_count,
        ROUND((COUNT(a.id) FILTER (WHERE a.status = 'present')::numeric / NULLIF(COUNT(a.id), 0)::numeric) * 100, 1) AS attendance_rate
      FROM attendance_records a
      JOIN students s ON a.student_id = s.id
      JOIN classes c ON s.current_class_id = c.id
      LEFT JOIN sections sec ON s.current_section_id = sec.id
      WHERE ${whereClause}
      GROUP BY c.name, sec.name
      ORDER BY c.name, sec.name
    `;

    const summaryResult = await pool.query(classSummaryQuery, params);

    // Daily attendance trend (last 14 days)
    const dailyTrendQuery = `
      SELECT 
        a.date::text,
        COUNT(a.id)::int AS total_students,
        COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS present_students,
        ROUND((COUNT(a.id) FILTER (WHERE a.status = 'present')::numeric / NULLIF(COUNT(a.id), 0)::numeric) * 100, 1) AS percentage
      FROM attendance_records a
      JOIN students s ON a.student_id = s.id
      WHERE ${whereClause}
      GROUP BY a.date
      ORDER BY a.date DESC
      LIMIT 14
    `;

    const trendResult = await pool.query(dailyTrendQuery, params);

    res.status(200).json({
      success: true,
      data: {
        by_class: summaryResult.rows,
        daily_trends: trendResult.rows.reverse()
      }
    });
  } catch (error: any) {
    console.error('Error fetching attendance report:', error);
    res.status(500).json({ success: false, message: 'Failed to generate attendance report' });
  }
};

/**
 * GET /api/v1/reports/fees
 * Financial reports: class-wise collections, payment methods, arrears
 */
export const getFeeReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { class_id, academic_year_id } = req.query as Record<string, string>;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let pIdx = 1;

    if (class_id) {
      conditions.push(`s.current_class_id = $${pIdx++}`);
      params.push(class_id);
    }
    if (academic_year_id) {
      conditions.push(`fa.academic_year_id = $${pIdx++}`);
      params.push(academic_year_id);
    }

    const whereClause = conditions.join(' AND ');

    // Class-wise fee collection table
    const classFeeQuery = `
      SELECT 
        c.name AS class_name,
        COUNT(DISTINCT s.id)::int AS total_students,
        COALESCE(SUM(fa.total_amount), 0)::numeric AS total_assigned,
        COALESCE(SUM(fp.amount_paid), 0)::numeric AS total_collected
      FROM classes c
      JOIN students s ON s.current_class_id = c.id
      LEFT JOIN student_fee_assignments fa ON fa.student_id = s.id
      LEFT JOIN fee_payments fp ON fp.student_id = s.id AND fp.status = 'completed'
      WHERE ${whereClause}
      GROUP BY c.name
      ORDER BY c.name
    `;

    const classFeeResult = await pool.query(classFeeQuery, params);

    // Payment method distribution
    const methodQuery = `
      SELECT 
        payment_mode,
        COUNT(*)::int AS transaction_count,
        SUM(amount_paid)::numeric AS total_amount
      FROM fee_payments
      WHERE status = 'completed'
      GROUP BY payment_mode
      ORDER BY total_amount DESC
    `;
    const methodResult = await pool.query(methodQuery);

    res.status(200).json({
      success: true,
      data: {
        by_class: classFeeResult.rows.map((row) => {
          const assigned = parseFloat(row.total_assigned || '0');
          const collected = parseFloat(row.total_collected || '0');
          return {
            class_name: row.class_name,
            total_students: row.total_students,
            total_assigned: assigned,
            total_collected: collected,
            total_pending: Math.max(0, assigned - collected),
            collection_rate: assigned > 0 ? Math.round((collected / assigned) * 100) : 0
          };
        }),
        payment_methods: methodResult.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching fee report:', error);
    res.status(500).json({ success: false, message: 'Failed to generate fee report' });
  }
};

/**
 * GET /api/v1/reports/academics
 * Academic exam pass rates and marks statistics
 */
export const getAcademicReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { class_id, academic_year_id } = req.query as Record<string, string>;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    let pIdx = 1;

    if (class_id) {
      conditions.push(`e.class_id = $${pIdx++}`);
      params.push(class_id);
    }
    if (academic_year_id) {
      conditions.push(`e.academic_year_id = $${pIdx++}`);
      params.push(academic_year_id);
    }

    const whereClause = conditions.join(' AND ');

    const academicQuery = `
      SELECT 
        c.name AS class_name,
        e.title AS exam_name,
        sub.name AS subject_name,
        COUNT(em.id)::int AS total_students_appeared,
        ROUND(AVG(em.marks_obtained)::numeric, 1) AS average_score,
        MAX(em.marks_obtained)::numeric AS highest_score,
        MIN(em.marks_obtained)::numeric AS lowest_score
      FROM exams e
      JOIN classes c ON e.class_id = c.id
      JOIN exam_subjects es ON es.exam_id = e.id
      JOIN subjects sub ON es.subject_id = sub.id
      LEFT JOIN exam_marks em ON em.exam_subject_id = es.id
      WHERE ${whereClause}
      GROUP BY c.name, e.title, sub.name
      ORDER BY c.name, e.title, sub.name
      LIMIT 50
    `;

    const result = await pool.query(academicQuery, params);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching academic report:', error);
    res.status(500).json({ success: false, message: 'Failed to generate academic report' });
  }
};

/**
 * GET /api/v1/reports/export
 * Download datasets formatted as CSV
 */
export const exportReportCsv = async (req: Request, res: Response): Promise<void> => {
  try {
    const { report_type = 'students' } = req.query as Record<string, string>;

    let filename = `saksham_${report_type}_report_${Date.now()}.csv`;
    let headers: string[] = [];
    let rows: any[] = [];

    if (report_type === 'students') {
      const q = `
        SELECT 
          s.admission_number,
          u.name AS student_name,
          u.email,
          s.gender,
          s.dob,
          c.name AS class_name,
          sec.name AS section_name,
          s.roll_number,
          s.status
        FROM students s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN classes c ON s.current_class_id = c.id
        LEFT JOIN sections sec ON s.current_section_id = sec.id
        ORDER BY c.name, s.roll_number
      `;
      const resData = await pool.query(q);
      headers = ['Admission Number', 'Student Name', 'Email', 'Gender', 'DOB', 'Class', 'Section', 'Roll Number', 'Status'];
      rows = resData.rows.map((r) => [
        r.admission_number,
        `"${r.student_name}"`,
        r.email,
        r.gender,
        r.dob,
        r.class_name || '',
        r.section_name || '',
        r.roll_number || '',
        r.status
      ]);
    } else if (report_type === 'teachers') {
      const q = `
        SELECT 
          t.employee_id,
          u.name,
          u.email,
          t.specialization,
          t.qualification,
          t.joining_date
        FROM teachers t
        JOIN users u ON t.user_id = u.id
        ORDER BY u.name
      `;
      const resData = await pool.query(q);
      headers = ['Employee ID', 'Teacher Name', 'Email', 'Specialization', 'Qualification', 'Joining Date'];
      rows = resData.rows.map((r) => [
        r.employee_id || '',
        `"${r.name}"`,
        r.email,
        r.specialization || '',
        `"${r.qualification || ''}"`,
        r.joining_date || ''
      ]);
    } else if (report_type === 'fees') {
      const q = `
        SELECT 
          fp.receipt_number,
          s.admission_number,
          u.name AS student_name,
          c.name AS class_name,
          fp.amount_paid,
          fp.payment_mode,
          fp.payment_date,
          fp.status
        FROM fee_payments fp
        JOIN students s ON fp.student_id = s.id
        JOIN users u ON s.user_id = u.id
        LEFT JOIN classes c ON s.current_class_id = c.id
        ORDER BY fp.payment_date DESC
      `;
      const resData = await pool.query(q);
      headers = ['Receipt No', 'Admission No', 'Student Name', 'Class', 'Amount Paid', 'Payment Mode', 'Date', 'Status'];
      rows = resData.rows.map((r) => [
        r.receipt_number,
        r.admission_number,
        `"${r.student_name}"`,
        r.class_name || '',
        r.amount_paid,
        r.payment_mode,
        r.payment_date,
        r.status
      ]);
    } else {
      headers = ['Message'];
      rows = [['Report type not supported for CSV export']];
    }

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (error: any) {
    console.error('Error exporting CSV report:', error);
    res.status(500).json({ success: false, message: 'Failed to export report' });
  }
};
