import { z } from 'zod';

// ── Fee Structure ──────────────────────────────────────────

export const createFeeStructureSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  class_id: z.string().uuid('Invalid class ID'),
  academic_year_id: z.string().uuid('Invalid academic year ID'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD'),
  description: z.string().max(500).optional(),
  components: z.array(z.object({
    name: z.string().min(1).max(100),
    amount: z.number().min(0, 'Amount must be non-negative'),
    is_optional: z.boolean().optional().default(false),
  })).min(1, 'At least one fee component is required'),
});

export const updateFeeStructureSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD').optional(),
  description: z.string().max(500).optional(),
});

// ── Fee Components ─────────────────────────────────────────

export const addComponentSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().min(0, 'Amount must be non-negative'),
  is_optional: z.boolean().optional().default(false),
});

export const updateComponentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  amount: z.number().min(0).optional(),
  is_optional: z.boolean().optional(),
});

// ── Student Fee Assignment ─────────────────────────────────

export const assignFeeSchema = z.object({
  student_id: z.string().uuid('Invalid student ID'),
  fee_structure_id: z.string().uuid('Invalid fee structure ID'),
  academic_year_id: z.string().uuid('Invalid academic year ID'),
  include_optional_component_ids: z.array(z.string().uuid()).optional().default([]),
});

// ── Payments ───────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  student_id: z.string().uuid('Invalid student ID'),
  academic_year_id: z.string().uuid('Invalid academic year ID'),
  amount_paid: z.number().positive('Amount must be greater than zero'),
  payment_mode: z.enum(['cash', 'cheque', 'bank_transfer']),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Payment date must be YYYY-MM-DD').optional(),
  cheque_number: z.string().max(50).optional(),
  bank_name: z.string().max(100).optional(),
  reference_number: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
}).superRefine((data, ctx) => {
  if (data.payment_mode === 'cheque') {
    if (!data.cheque_number) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cheque number is required for cheque payments', path: ['cheque_number'] });
    }
    if (!data.bank_name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bank name is required for cheque payments', path: ['bank_name'] });
    }
  }
  if (data.payment_mode === 'bank_transfer' && !data.reference_number) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reference number is required for bank transfer payments', path: ['reference_number'] });
  }
});
