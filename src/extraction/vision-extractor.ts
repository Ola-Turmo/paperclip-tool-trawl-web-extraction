import { ExtractionConfig, ExtractionResult } from '../extraction-schema.js';
import { scoreConfidence, getMethodReliability } from '../confidence-scorer.js';

export interface VisionExtractorOptions {
  apiKey: string;
  model: string;
}

interface VisionExtractionResponse {
  data: Record<string, unknown>;
  descriptions?: string[];
}

/**
 * Default vision extraction prompt
 */
const DEFAULT_VISION_PROMPT = `Analyze this image and extract structured data in JSON format.
The data should match the schema of expected fields.
Return ONLY valid JSON without any additional text.`;

/**
 * Converts image buffer to base64 for API transmission
 */
function imageToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

async function callVisionApi(
  imageBuffer: Buffer,
  config: ExtractionConfig,
  options: VisionExtractorOptions
): Promise<VisionExtractionResponse> {
  const base64Image = imageToBase64(imageBuffer);
  const mimeType = detectImageMimeType(imageBuffer);

  // Generic OpenAI-compatible vision API implementation
  const apiUrl = 'https://api.openai.com/v1/chat/completions';
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: DEFAULT_VISION_PROMPT,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = result.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from Vision API');
  }

  try {
    return JSON.parse(content) as VisionExtractionResponse;
  } catch {
    throw new Error('Failed to parse Vision API response as JSON');
  }
}

/**
 * Detects image MIME type from buffer magic bytes
 */
function detectImageMimeType(buffer: Buffer): string {
  if (buffer.length < 4) return 'application/octet-stream';

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  // WebP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'image/webp';
  }

  return 'application/octet-stream';
}

function validateExtractedData(
  data: unknown
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

  const extractedData = data as Record<string, unknown>;
  if (Object.keys(extractedData).length === 0) {
    warnings.push('No fields extracted from image');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export async function extractWithVision(
  imageBuffer: Buffer,
  config: ExtractionConfig,
  options: VisionExtractorOptions
): Promise<ExtractionResult> {
  const errors: string[] = [];

  try {
    const response = await callVisionApi(imageBuffer, config, options);
    const validation = validateExtractedData(response.data);

    // Vision extraction typically has high completeness when successful
    const dataKeys = Object.keys(response.data);
    const factors = {
      methodReliability: getMethodReliability('vision'),
      dataCompleteness: dataKeys.length > 0 ? 0.85 : 0,
      schemaAlignment: validation.valid ? 0.85 : 0.5,
    };

    const confidence = scoreConfidence(factors);

    return {
      data: response.data,
      confidence: confidence.score,
      method: 'vision',
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
      method: 'vision',
      timestamp: new Date().toISOString(),
      errors,
    };
  }
}
