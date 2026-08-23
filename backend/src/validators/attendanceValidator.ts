import { z } from 'zod';

export const markBulkAttendanceSchema = z.object({
  class_id: z.string().uuid('Invalid class ID'),
  academic_year_id: z.string().uuid('Invalid academic year ID'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  type: z.enum(['daily', 'subject']),
  subject_id: z.string().uuid('Invalid subject ID').optional(),
  records: z.array(z.object({
    student_id: z.string().uuid('Invalid student ID'),
    status: z.enum(['present', 'absent', 'late', 'half_day']),
    remarks: z.string().max(255).optional(),
  })).min(1, 'At least one attendance record is required')
}).refine((data) => {
  if (data.type === 'subject' && !data.subject_id) {
    return false;
  }
  return true;
}, {
  message: "subject_id is required when type is 'subject'",
  path: ['subject_id']
});
