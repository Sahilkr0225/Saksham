import { z } from 'zod';

export const createFaqSchema = z.object({
  category: z.enum(['general', 'admissions', 'fees', 'attendance', 'academics', 'account']),
  question: z.string().min(3, 'Question must be at least 3 characters').max(500),
  answer: z.string().min(3, 'Answer must be at least 3 characters').max(2000),
  display_order: z.number().int().optional().default(0)
});

export const createTicketSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(255),
  category: z.enum(['technical', 'academic', 'fees', 'admissions', 'general']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  description: z.string().min(5, 'Description must be at least 5 characters').max(3000)
});

export const createReplySchema = z.object({
  message: z.string().min(1, 'Reply message cannot be empty').max(2000)
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed'])
});
