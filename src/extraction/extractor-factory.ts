import { ExtractionConfig, ExtractionResult, ExtractionMethod } from '../extraction-schema.js';
import { extractWithLLM, LLMExtractorOptions } from './llm-extractor.js';
import { extractWithVision, VisionExtractorOptions } from './vision-extractor.js';
import { detectTables, extractTableData, TableDetectionResult } from './table-detector.js';
import { extractWithRegex, RegexPattern, COMMON_PATTERNS } from './regex-extractor.js';

/**
 * Base extractor interface
 */
export interface Extractor {
  extract(html: string, config: ExtractionConfig): Promise<ExtractionResult>;
}

/**
 * LLM-based extractor implementation
 */
class LLMExtractor implements Extractor {
  constructor(private options: LLMExtractorOptions) {}

  async extract(html: string, config: ExtractionConfig): Promise<ExtractionResult> {
    return extractWithLLM(html, config, this.options);
  }
}

/**
 * Vision-based extractor implementation
 */
class VisionExtractor implements Extractor {
  constructor(private options: VisionExtractorOptions) {}

  async extract(_html: string, _config: ExtractionConfig): Promise<ExtractionResult> {
    // Vision extractor requires an image buffer, not HTML
    // This is a placeholder - in practice you'd convert HTML to image first
    return {
      data: null,
      confidence: 0,
      method: 'vision',
      timestamp: new Date().toISOString(),
      errors: ['Vision extraction requires image input, not HTML directly'],
    };
  }

  async extractImage(imageBuffer: Buffer, config: ExtractionConfig): Promise<ExtractionResult> {
    return extractWithVision(imageBuffer, config, this.options);
  }
}

/**
 * Table-based extractor implementation
 */
class TableExtractor implements Extractor {
  constructor(private tableIndex: number = 0) {}

  async extract(html: string, config: ExtractionConfig): Promise<ExtractionResult> {
    const tableResult = extractTableData(html, this.tableIndex);
    const tables = tableResult.tables;

    if (tables.length === 0) {
      return {
        data: null,
        confidence: 0,
        method: 'table',
        timestamp: new Date().toISOString(),
        errors: [`Table at index ${this.tableIndex} not found`],
      };
    }

    const table = tables[0];
    // Convert table data to an array of objects
    const rows = table.rows.map(row => {
      const obj: Record<string, string> = {};
      table.headers.forEach((header, i) => {
        obj[header] = row[i] || '';
      });
      return obj;
    });

    return {
      data: { headers: table.headers, rows },
      confidence: table.confidence,
      method: 'table',
      timestamp: new Date().toISOString(),
      errors: [],
      schemaValidation: {
        valid: table.headers.length > 0,
        errors: [],
        warnings: table.rows.length === 0 ? ['Table has no data rows'] : [],
      },
    };
  }
}

/**
 * Regex-based extractor implementation
 */
class RegexExtractor implements Extractor {
  constructor(private patterns: RegexPattern[]) {
    if (patterns.length === 0) {
      // Use common patterns by default
      this.patterns = Object.values(COMMON_PATTERNS);
    }
  }

  async extract(html: string, config: ExtractionConfig): Promise<ExtractionResult> {
    return extractWithRegex(html, config, this.patterns);
  }
}

/**
 * Creates an extractor instance for the specified method
 */
export function createExtractor(
  method: ExtractionMethod,
  options?: {
    llm?: LLMExtractorOptions;
    vision?: VisionExtractorOptions;
    tableIndex?: number;
    patterns?: RegexPattern[];
  }
): Extractor {
  switch (method) {
    case 'llm':
      if (!options?.llm) {
        throw new Error('LLM extractor requires options with apiKey and model');
      }
      return new LLMExtractor(options.llm);

    case 'vision':
      if (!options?.vision) {
        throw new Error('Vision extractor requires options with apiKey and model');
      }
      return new VisionExtractor(options.vision);

    case 'table':
      return new TableExtractor(options?.tableIndex ?? 0);

    case 'regex':
      return new RegexExtractor(options?.patterns ?? []);

    default:
      throw new Error(`Unknown extraction method: ${method}`);
  }
}

export { detectTables, extractTableData };
export type { TableDetectionResult, RegexPattern };
