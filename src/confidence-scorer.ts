import { ConfidenceScore, ConfidenceScoreSchema } from './extraction-schema.js';

/**
 * Factors that contribute to confidence scoring
 */
export interface ConfidenceFactors {
  /** 0-1 based on extraction method reliability */
  methodReliability: number;
  /** 0-1 based on how many fields were populated */
  dataCompleteness: number;
  /** 0-1 based on how well data matches expected schema */
  schemaAlignment: number;
}

/**
 * Method reliability weights for confidence calculation
 */
const METHOD_RELIABILITY: Record<string, number> = {
  vision: 0.95,
  llm: 0.85,
  table: 0.80,
  regex: 0.60,
};

/**
 * Calculate overall confidence score from factors
 */
export function scoreConfidence(factors: ConfidenceFactors): ConfidenceScore {
  const warnings: string[] = [];
  const score =
    factors.methodReliability * 0.3 +
    factors.dataCompleteness * 0.35 +
    factors.schemaAlignment * 0.35;

  // Add warnings for low scores
  if (factors.methodReliability < 0.7) {
    warnings.push(`Low method reliability: ${(factors.methodReliability * 100).toFixed(0)}%`);
  }
  if (factors.dataCompleteness < 0.5) {
    warnings.push(`Incomplete data extraction: ${(factors.dataCompleteness * 100).toFixed(0)}%`);
  }
  if (factors.schemaAlignment < 0.6) {
    warnings.push(`Schema alignment issues detected`);
  }

  return ConfidenceScoreSchema.parse({
    score: Math.round(score * 1000) / 1000,
    factors: [
      `method:${(factors.methodReliability * 100).toFixed(0)}%`,
      `completeness:${(factors.dataCompleteness * 100).toFixed(0)}%`,
      `alignment:${(factors.schemaAlignment * 100).toFixed(0)}%`,
    ],
    warnings,
  });
}

/**
 * Get reliability score for a given method
 */
export function getMethodReliability(method: string): number {
  return METHOD_RELIABILITY[method] ?? 0.5;
}
