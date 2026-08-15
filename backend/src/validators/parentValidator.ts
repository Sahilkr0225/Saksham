import { z } from 'zod';

export const linkStudentSchema = z.object({
  student_id: z.string().uuid({ message: 'Invalid student ID format' })
});

export default {
  linkStudentSchema
};
