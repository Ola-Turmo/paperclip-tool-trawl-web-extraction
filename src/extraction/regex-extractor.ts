import { ExtractionConfig, ExtractionResult } from '../extraction-schema.js';
import { scoreConfidence, getMethodReliability } from '../confidence-scorer.js';

export interface RegexPattern {
  name: string;
  pattern: RegExp;
  field: string;
}

export async function extractWithRegex(
  html: string,
  config: ExtractionConfig,
  patterns: RegexPattern[]
): Promise<ExtractionResult> {
  const errors: string[] = [];
  const extractedData: Record<string, unknown> = {};
  let matchCount = 0;
  let patternCount = 0;

  for (const { name, pattern, field } of patterns) {
    patternCount++;
    try {
      // Reset lastIndex for global regex patterns
      pattern.lastIndex = 0;
      
      const matches = [];
      let match;

      // Handle both global and non-global patterns
      if (pattern.global) {
        while ((match = pattern.exec(html)) !== null) {
          matches.push(match[1] ?? match[0]);
          matchCount++;
          // Safety check for infinite loops
          if (match.index === pattern.lastIndex) {
            pattern.lastIndex++;
          }
        }
      } else {
        match = pattern.exec(html);
        if (match) {
          matches.push(match[1] ?? match[0]);
          matchCount++;
        }
      }

      // Store the result
      if (matches.length === 1) {
        extractedData[field] = matches[0];
      } else if (matches.length > 1) {
        extractedData[field] = matches;
      } else {
        extractedData[field] = null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? `Pattern ${name}: ${error.message}` 
        : `Pattern ${name}: Unknown error`;
      errors.push(errorMessage);
      extractedData[field] = null;
    }
  }

  // Calculate confidence
  const factors = {
    methodReliability: getMethodReliability('regex'),
    dataCompleteness: patternCount > 0 ? matchCount / patternCount : 0,
    schemaAlignment: matchCount > 0 ? 0.6 : 0.3, // Regex is less precise
  };

  const confidence = scoreConfidence(factors);

  return {
    data: extractedData,
    confidence: confidence.score,
    method: 'regex',
    timestamp: new Date().toISOString(),
    errors,
  };
}

/**
 * Common regex patterns for web extraction
 */
export const COMMON_PATTERNS = {
  email: {
    name: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    field: 'email',
  },
  phone: {
    name: 'phone',
    pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    field: 'phone',
  },
  url: {
    name: 'url',
    pattern: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
    field: 'url',
  },
  date: {
    name: 'date',
    pattern: /(?:\d{1,2}[-\/])?\d{1,2}[-\/]\d{2,4}|\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/g,
    field: 'date',
  },
  price: {
    name: 'price',
    pattern: /\$\s*\d+(?:,\d{3})*(?:\.\d{2})?|\d+(?:,\d{3})*\.\d{2}\s*(?:USD|EUR|GBP)?/gi,
    field: 'price',
  },
};
