import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

// Grade calculation helper
const calculateGrade = (percentage: number, isAbsent: boolean = false): string => {
  if (isAbsent) return 'F (ABSENT)';
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
};

// POST /api/v1/exams
export const createExam = async (req: Request, res: Response) => {
  try {
    const { title, type, academic_year_id, class_id } = req.body;
    const userId = (req as any).user?.userId;

    const result = await pool.query(`
      INSERT INTO exams (title, type, academic_year_id, class_id, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [title, type, academic_year_id, class_id, userId]);

    await createAuditLog({
      userId, action: 'CREATE', resource: 'exams', resourceId: result.rows[0].id,
      oldValue: null, newValue: result.rows[0], ipAddress: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Exam created successfully',
      data: { exam: result.rows[0] }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// POST /api/v1/exams/subjects
export const addExamSubject = async (req: Request, res: Response) => {
  try {
    const { exam_id, subject_id, exam_date, start_time, end_time, max_marks, pass_marks } = req.body;

    const result = await pool.query(`
      INSERT INTO exam_subjects (exam_id, subject_id, exam_date, start_time, end_time, max_marks, pass_marks)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [exam_id, subject_id, exam_date, start_time || null, end_time || null, max_marks || 100, pass_marks || 40]);

    res.status(201).json({
      success: true,
      message: 'Subject schedule added to exam successfully',
      data: { exam_subject: result.rows[0] }
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Subject already added to this exam' });
    }
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// POST /api/v1/exams/marks  (Bulk marks entry)
export const enterBulkMarks = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { exam_subject_id, marks } = req.body;
    const userId = (req as any).user?.userId;

    await client.query('BEGIN');

    const upsertedMarks: any[] = [];
    for (const item of marks) {
      const { student_id, marks_obtained, is_absent = false, remarks } = item;
      const resQuery = await client.query(`
        INSERT INTO exam_marks (exam_subject_id, student_id, marks_obtained, is_absent, remarks, graded_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (exam_subject_id, student_id) DO UPDATE
        SET marks_obtained = EXCLUDED.marks_obtained,
            is_absent = EXCLUDED.is_absent,
            remarks = EXCLUDED.remarks,
            graded_by = EXCLUDED.graded_by,
            updated_at = NOW()
        RETURNING *
      `, [exam_subject_id, student_id, is_absent ? null : marks_obtained, is_absent, remarks || null, userId]);

      upsertedMarks.push(resQuery.rows[0]);
    }

    await client.query('COMMIT');

    await createAuditLog({
      userId, action: 'UPDATE', resource: 'exam_marks', resourceId: exam_subject_id,
      oldValue: null, newValue: { count: upsertedMarks.length }, ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: `Marks recorded successfully for ${upsertedMarks.length} students`,
      data: { marks: upsertedMarks }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  } finally {
    client.release();
  }
};

// PATCH /api/v1/exams/:id/status
export const updateExamStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = (req as any).user?.userId;

    const existing = await pool.query(`SELECT * FROM exams WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const result = await pool.query(`
      UPDATE exams SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *
    `, [status, id]);

    await createAuditLog({
      userId, action: 'UPDATE', resource: 'exams', resourceId: id,
      oldValue: existing.rows[0], newValue: result.rows[0], ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: `Exam status updated to '${status}'`,
      data: { exam: result.rows[0] }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/exams/class/:classId
export const getExamsForClass = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { academic_year_id } = req.query;

    let query = `
      SELECT e.*, 
             (SELECT COUNT(*) FROM exam_subjects es WHERE es.exam_id = e.id) as subject_count,
             u.name as created_by_name
      FROM exams e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.class_id = $1
    `;
    const params: any[] = [classId];

    if (academic_year_id) {
      params.push(academic_year_id);
      query += ` AND e.academic_year_id = $${params.length}`;
    }

    query += ` ORDER BY e.created_at DESC`;

    const result = await pool.query(query, params);
    res.status(200).json({ success: true, data: { exams: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/exams/:id
export const getExamDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const examRes = await pool.query(`
      SELECT e.*, c.name as class_name, ay.name as academic_year_name, u.name as created_by_name
      FROM exams e
      JOIN classes c ON e.class_id = c.id
      JOIN academic_years ay ON e.academic_year_id = ay.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = $1
    `, [id]);

    if (examRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const subjectsRes = await pool.query(`
      SELECT es.*, s.name as subject_name, s.code as subject_code
      FROM exam_subjects es
      JOIN subjects s ON es.subject_id = s.id
      WHERE es.exam_id = $1
      ORDER BY es.exam_date ASC
    `, [id]);

    res.status(200).json({
      success: true,
      data: {
        exam: examRes.rows[0],
        subjects: subjectsRes.rows
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/exams/:id/results/student/:studentId
export const getStudentResult = async (req: Request, res: Response) => {
  try {
    const { id: examId, studentId } = req.params;
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.userId;

    // Check Exam status
    const examRes = await pool.query(`
      SELECT e.*, c.name as class_name, ay.name as academic_year_name
      FROM exams e
      JOIN classes c ON e.class_id = c.id
      JOIN academic_years ay ON e.academic_year_id = ay.id
      WHERE e.id = $1
    `, [examId]);

    if (examRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const exam = examRes.rows[0];

    // Students and Parents can only see results if exam status is 'published'
    if ((userRole === 'student' || userRole === 'parent') && exam.status !== 'published') {
      return res.status(403).json({
        success: false,
        message: 'Results for this exam have not been published yet'
      });
    }

    let targetStudentId = studentId;

    // Check Student ownership for student/parent roles
    if (userRole === 'student') {
      const selfStudent = await pool.query(`SELECT id FROM students WHERE user_id = $1`, [userId]);
      if (selfStudent.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Student profile not found' });
      }
      if (studentId === 'me') {
        targetStudentId = selfStudent.rows[0].id;
      } else if (selfStudent.rows[0].id !== studentId) {
        return res.status(403).json({ success: false, message: 'Access denied to this student result' });
      }
    } else if (userRole === 'parent') {
      const parentProfile = await pool.query(`SELECT id FROM parents WHERE user_id = $1`, [userId]);
      if (parentProfile.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Parent profile not found' });
      }
      const linkCheck = await pool.query(`
        SELECT * FROM student_parents WHERE parent_id = $1 AND student_id = $2
      `, [parentProfile.rows[0].id, studentId]);
      if (linkCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied: student is not linked to your account' });
      }
    }

    // Fetch Student Info
    const studentRes = await pool.query(`
      SELECT s.id, s.admission_number, s.roll_number, u.name as student_name
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = $1
    `, [targetStudentId]);

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Fetch Subject Schedules & Marks
    const resultRes = await pool.query(`
      SELECT es.id as exam_subject_id, es.exam_date, es.max_marks, es.pass_marks,
             s.name as subject_name, s.code as subject_code,
             em.marks_obtained, em.is_absent, em.remarks
      FROM exam_subjects es
      JOIN subjects s ON es.subject_id = s.id
      LEFT JOIN exam_marks em ON em.exam_subject_id = es.id AND em.student_id = $2
      WHERE es.exam_id = $1
      ORDER BY es.exam_date ASC
    `, [examId, targetStudentId]);

    let totalMaxMarks = 0;
    let totalObtained = 0;
    let hasFailedSubject = false;

    const subjectsBreakdown = resultRes.rows.map((row) => {
      const maxMarks = Number(row.max_marks);
      const marksObtained = row.marks_obtained !== null ? Number(row.marks_obtained) : null;
      const isAbsent = Boolean(row.is_absent);

      totalMaxMarks += maxMarks;

      let subjectPercentage = 0;
      let passStatus = false;
      let grade = 'F';

      if (isAbsent) {
        grade = 'F (ABSENT)';
        hasFailedSubject = true;
      } else if (marksObtained !== null) {
        totalObtained += marksObtained;
        subjectPercentage = (marksObtained / maxMarks) * 100;
        passStatus = marksObtained >= Number(row.pass_marks);
        if (!passStatus) hasFailedSubject = true;
        grade = calculateGrade(subjectPercentage, false);
      } else {
        hasFailedSubject = true;
        grade = 'N/A';
      }

      return {
        subject_name: row.subject_name,
        subject_code: row.subject_code,
        exam_date: row.exam_date,
        max_marks: maxMarks,
        pass_marks: Number(row.pass_marks),
        marks_obtained: marksObtained,
        is_absent: isAbsent,
        pass_status: passStatus,
        grade,
        remarks: row.remarks
      };
    });

    const overallPercentage = totalMaxMarks > 0 ? Number(((totalObtained / totalMaxMarks) * 100).toFixed(2)) : 0;
    const overallGrade = calculateGrade(overallPercentage, false);
    const overallStatus = (!hasFailedSubject && totalMaxMarks > 0) ? 'PASS' : 'FAIL';

    res.status(200).json({
      success: true,
      data: {
        exam: {
          id: exam.id,
          title: exam.title,
          type: exam.type,
          class_name: exam.class_name,
          academic_year_name: exam.academic_year_name,
          status: exam.status
        },
        student: studentRes.rows[0],
        summary: {
          total_max_marks: totalMaxMarks,
          total_marks_obtained: totalObtained,
          overall_percentage: overallPercentage,
          overall_grade: overallGrade,
          overall_status: overallStatus
        },
        subjects: subjectsBreakdown
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/exams/:id/results/class/:classId  (Teacher / Admin Summary)
export const getClassResults = async (req: Request, res: Response) => {
  try {
    const { id: examId, classId } = req.params;

    const studentsRes = await pool.query(`
      SELECT s.id as student_id, s.roll_number, u.name as student_name
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.current_class_id = $1 AND s.status = 'active'
      ORDER BY s.roll_number ASC, u.name ASC
    `, [classId]);

    const resultsSummary: any[] = [];
    for (const student of studentsRes.rows) {
      const marksQuery = await pool.query(`
        SELECT es.max_marks, es.pass_marks, em.marks_obtained, em.is_absent
        FROM exam_subjects es
        LEFT JOIN exam_marks em ON em.exam_subject_id = es.id AND em.student_id = $2
        WHERE es.exam_id = $1
      `, [examId, student.student_id]);

      let totalMax = 0;
      let totalObtained = 0;
      let failed = false;

      for (const m of marksQuery.rows) {
        totalMax += Number(m.max_marks);
        if (m.is_absent || m.marks_obtained === null || Number(m.marks_obtained) < Number(m.pass_marks)) {
          failed = true;
        }
        if (m.marks_obtained !== null && !m.is_absent) {
          totalObtained += Number(m.marks_obtained);
        }
      }

      const percentage = totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;
      resultsSummary.push({
        student_id: student.student_id,
        student_name: student.student_name,
        roll_number: student.roll_number,
        total_max_marks: totalMax,
        total_obtained: totalObtained,
        percentage,
        grade: calculateGrade(percentage),
        status: (failed || totalMax === 0) ? 'FAIL' : 'PASS'
      });
    }

    res.status(200).json({
      success: true,
      data: { class_id: classId, exam_id: examId, total_students: resultsSummary.length, results: resultsSummary }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/exams  (List all exams with optional filters)
export const listExams = async (req: Request, res: Response) => {
  try {
    const { academic_year_id, class_id, status } = req.query;

    let query = `
      SELECT e.*, 
             c.name as class_name,
             ay.name as academic_year_name,
             (SELECT COUNT(*) FROM exam_subjects es WHERE es.exam_id = e.id) as subject_count,
             u.name as created_by_name
      FROM exams e
      JOIN classes c ON e.class_id = c.id
      JOIN academic_years ay ON e.academic_year_id = ay.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (academic_year_id) {
      params.push(academic_year_id);
      query += ` AND e.academic_year_id = $${params.length}`;
    }
    if (class_id) {
      params.push(class_id);
      query += ` AND e.class_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND e.status = $${params.length}`;
    }

    query += ` ORDER BY e.created_at DESC`;

    const result = await pool.query(query, params);
    res.status(200).json({ success: true, data: { exams: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/exams/subjects/:examSubjectId/marks  (Roster of students and current marks for a subject)
export const getExamSubjectMarks = async (req: Request, res: Response) => {
  try {
    const { examSubjectId } = req.params;

    const subjectRes = await pool.query(`
      SELECT es.*, s.name as subject_name, s.code as subject_code,
             e.id as exam_id, e.title as exam_title, e.class_id, e.status as exam_status,
             c.name as class_name
      FROM exam_subjects es
      JOIN exams e ON es.exam_id = e.id
      JOIN subjects s ON es.subject_id = s.id
      JOIN classes c ON e.class_id = c.id
      WHERE es.id = $1
    `, [examSubjectId]);

    if (subjectRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam subject schedule not found' });
    }

    const examSubject = subjectRes.rows[0];

    // Fetch active enrolled students in this class with their existing marks
    const marksRes = await pool.query(`
      SELECT s.id as student_id, s.admission_number, s.roll_number, u.name as student_name,
             em.marks_obtained, em.is_absent, em.remarks, em.graded_by,
             sec.name as section_name
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN sections sec ON s.current_section_id = sec.id
      LEFT JOIN exam_marks em ON em.exam_subject_id = $1 AND em.student_id = s.id
      WHERE s.current_class_id = $2 AND s.status = 'active'
      ORDER BY s.roll_number ASC NULLS LAST, u.name ASC
    `, [examSubjectId, examSubject.class_id]);

    res.status(200).json({
      success: true,
      data: {
        exam_subject: examSubject,
        students: marksRes.rows
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// DELETE /api/v1/exams/:id  (Delete exam if not published)
export const deleteExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const existing = await pool.query(`SELECT * FROM exams WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }
    if (existing.rows[0].status === 'published') {
      return res.status(400).json({ success: false, message: 'Cannot delete published exam' });
    }

    await pool.query(`DELETE FROM exams WHERE id = $1`, [id]);

    await createAuditLog({
      userId, action: 'DELETE', resource: 'exams', resourceId: id,
      oldValue: existing.rows[0], newValue: null, ipAddress: req.ip
    });

    res.status(200).json({ success: true, message: 'Exam deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// DELETE /api/v1/exams/subjects/:examSubjectId  (Remove subject schedule)
export const deleteExamSubject = async (req: Request, res: Response) => {
  try {
    const { examSubjectId } = req.params;

    const existing = await pool.query(`
      SELECT es.*, e.status as exam_status 
      FROM exam_subjects es 
      JOIN exams e ON es.exam_id = e.id 
      WHERE es.id = $1
    `, [examSubjectId]);

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam subject schedule not found' });
    }
    if (existing.rows[0].exam_status === 'published') {
      return res.status(400).json({ success: false, message: 'Cannot remove subjects from a published exam' });
    }

    await pool.query(`DELETE FROM exam_subjects WHERE id = $1`, [examSubjectId]);

    res.status(200).json({ success: true, message: 'Subject schedule removed from exam' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

