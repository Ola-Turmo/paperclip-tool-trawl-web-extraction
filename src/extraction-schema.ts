import { z } from 'zod';

/**
 * Supported extraction methods
 */
export const ExtractionMethodSchema = z.enum(['llm', 'vision', 'table', 'regex']);
export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

/**
 * Configuration for extraction operations
 */
export const ExtractionConfigSchema = z.object({
  url: z.string().url(),
  schema: z.instanceof(z.ZodType),
  options: z.object({
    method: ExtractionMethodSchema,
    confidenceThreshold: z.number().min(0).max(1).default(0.7),
    temperature: z.number().min(0).max(2).optional(),
    model: z.string().optional(),
    extractionPromptTemplate: z.string().optional(),
    timeout: z.number().positive().optional(),
    maxRetries: z.number().int().nonnegative().optional(),
  }),
});
export type ExtractionConfig = z.infer<typeof ExtractionConfigSchema>;

/**
 * Confidence score with breakdown factors
 */
export const ConfidenceScoreSchema = z.object({
  score: z.number().min(0).max(1),
  factors: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;

/**
 * Result of schema validation
 */
export const SchemaValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SchemaValidationResult = z.infer<typeof SchemaValidationResultSchema>;

/**
 * Result of an extraction operation
 */
export const ExtractionResultSchema = z.object({
  data: z.unknown(),
  confidence: z.number().min(0).max(1),
  method: ExtractionMethodSchema,
  timestamp: z.string().datetime(),
  errors: z.array(z.string()),
  schemaValidation: SchemaValidationResultSchema.optional(),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
