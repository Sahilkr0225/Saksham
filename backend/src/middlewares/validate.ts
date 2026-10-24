import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodSchema } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message
        }));

        res.status(400).json({
          success: false,
          message: 'Input validation failed',
          data: {
            errors: formattedErrors
          }
        });
        return;
      }
      next(error);
    }
  };
};

export const validateUUIDParam = (paramName: string = 'id') => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (req: Request, res: Response, next: NextFunction): void => {
    const val = req.params[paramName];
    if (!val || !uuidRegex.test(val)) {
      res.status(400).json({
        success: false,
        message: `Invalid ${paramName} parameter: must be a valid UUID`,
        data: {
          errors: [{ field: paramName, message: 'Invalid UUID format' }]
        }
      });
      return;
    }
    next();
  };
};

export default validateRequest;
