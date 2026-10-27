import { z } from 'zod';

export const attendanceReportQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  section_id: z.string().uuid().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export const feeReportQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional()
});

export const academicReportQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  exam_id: z.string().uuid().optional()
});

export const exportReportQuerySchema = z.object({
  report_type: z.enum(['students', 'teachers', 'fees', 'attendance', 'documents']),
  academic_year_id: z.string().uuid().optional()
});
