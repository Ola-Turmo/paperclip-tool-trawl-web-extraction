import { ExtractionConfig, ExtractionResult } from '../extraction-schema.js';
import { scoreConfidence, getMethodReliability } from '../confidence-scorer.js';

export interface LLMExtractorOptions {
  apiKey: string;
  model: string;
  temperature?: number;
  extractionPromptTemplate?: string;
}

/**
 * Default prompt template for LLM extraction
 */
const DEFAULT_PROMPT_TEMPLATE = `Extract structured data from the following HTML content based on the provided schema.

URL: {url}

HTML Content:
{html}

Please extract the data and return it in JSON format matching the schema. If data is not found for a field, use null.`;

interface LLMExtractionResponse {
  data: Record<string, unknown>;
  reasoning?: string;
}

function buildPrompt(
  html: string,
  config: ExtractionConfig,
  template: string
): string {
  return template
    .replace('{url}', config.url)
    .replace('{html}', html.slice(0, 15000)); // Limit HTML size
}

async function callLLMApi(
  html: string,
  config: ExtractionConfig,
  options: LLMExtractorOptions
): Promise<LLMExtractionResponse> {
  const prompt = buildPrompt(
    html,
    config,
    options.extractionPromptTemplate ?? DEFAULT_PROMPT_TEMPLATE
  );

  // Note: This is a generic implementation. In production, you would
  // integrate with specific LLM providers (OpenAI, Anthropic, etc.)
  // For now, we construct a structured request that could be used
  // with any OpenAI-compatible API
  const apiUrl = 'https://api.openai.com/v1/chat/completions';
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a data extraction assistant. Extract structured JSON data from HTML. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: options.temperature ?? 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  
  const content = result.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from LLM API');
  }

  // Parse the JSON response
  try {
    return JSON.parse(content) as LLMExtractionResponse;
  } catch {
    throw new Error('Failed to parse LLM response as JSON');
  }
}

function validateExtractedData(
  data: unknown,
  config: ExtractionConfig
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (data === null || data === undefined) {
    errors.push('Extracted data is null or undefined');
    return { valid: false, errors, warnings };
  }

  if (typeof data !== 'object') {
    errors.push(`Expected object, got ${typeof data}`);
    return { valid: false, errors, warnings };
  }

  // Basic schema field validation
  const extractedData = data as Record<string, unknown>;
  const schemaFields = extractSchemaFields(config.schema);
  
  for (const field of schemaFields) {
    if (!(field in extractedData)) {
      warnings.push(`Missing expected field: ${field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function extractSchemaFields(schema: unknown): string[] {
  // Attempt to extract field names from Zod schema
  if (schema && typeof schema === 'object' && 'shape' in schema) {
    const s = schema as Record<string, unknown>;
    const shape = s['shape'];
    if (typeof shape === 'function') {
      const shapeObj = (shape as () => Record<string, unknown>)();
      return Object.keys(shapeObj);
    }
  }
  return [];
}

function countPopulatedFields(
  data: unknown,
  schema: unknown
): number {
  if (typeof data !== 'object' || data === null) return 0;
  
  const extractedData = data as Record<string, unknown>;
  const schemaFields = extractSchemaFields(schema);
  
  if (schemaFields.length === 0) {
    // If we can't determine schema fields, count non-null values
    return Object.values(extractedData).filter(v => v !== null).length;
  }
  
  return schemaFields.filter(f => extractedData[f] !== null && extractedData[f] !== undefined).length;
}

export async function extractWithLLM(
  html: string,
  config: ExtractionConfig,
  options: LLMExtractorOptions
): Promise<ExtractionResult> {
  const errors: string[] = [];
  
  try {
    const response = await callLLMApi(html, config, options);
    
    const validation = validateExtractedData(response.data, config);
    
    // Calculate confidence
    const schemaFields = extractSchemaFields(config.schema);
    const populatedCount = countPopulatedFields(response.data, config.schema);
    const dataCompleteness = schemaFields.length > 0 
      ? populatedCount / schemaFields.length 
      : Object.keys(response.data).length > 0 ? 0.7 : 0;

    const factors = {
      methodReliability: getMethodReliability('llm'),
      dataCompleteness,
      schemaAlignment: validation.valid ? 0.9 : 0.5,
    };

    const confidence = scoreConfidence(factors);

    return {
      data: response.data,
      confidence: confidence.score,
      method: 'llm',
      timestamp: new Date().toISOString(),
      errors: validation.errors,
      schemaValidation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMessage);
    
    return {
      data: null,
      confidence: 0,
      method: 'llm',
      timestamp: new Date().toISOString(),
      errors,
    };
  }
}
