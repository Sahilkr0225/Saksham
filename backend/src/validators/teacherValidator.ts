import { z } from 'zod';

export const updateTeacherProfileSchema = z.object({
  employee_id: z.string().max(50, 'Employee ID must not exceed 50 characters').optional().nullable(),
  specialization: z.string().max(100, 'Specialization must not exceed 100 characters').optional().nullable(),
  qualification: z.string().max(255, 'Qualification must not exceed 255 characters').optional().nullable(),
  joining_date: z.string().date('Invalid joining date format').optional().nullable(),
  address: z.string().optional().nullable(),
  emergency_contact: z.string().max(20, 'Emergency contact must not exceed 20 characters').optional().nullable()
});

export type UpdateTeacherProfileInput = z.infer<typeof updateTeacherProfileSchema>;

export default {
  updateTeacherProfileSchema
};
