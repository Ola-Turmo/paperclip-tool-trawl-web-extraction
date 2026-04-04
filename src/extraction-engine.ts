/**
 * Trawl Web Extraction - Extraction Engine
 * 
 * Core extraction logic with schema validation, provenance tracking,
 * confidence scoring, drift detection, and failure handling.
 */

import { createHash } from "crypto";
import type {
  ExtractionSchema,
  ExtractionTarget,
  ExtractionResult,
  ExtractedField,
  ProvenanceInfo,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  DriftReport,
  DriftSignatureResult,
  FailureEvidence,
  PreservedCapture,
  PolicyFlag,
  ConfidenceLevel,
  ExtractionOptions,
  ExtractionExecutionResult,
  ExtractionRun,
} from "./types.js";
import { evidenceStore } from "./evidence-store.js";

// Simple hash function for content fingerprinting
function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 16);
}

// Mock HTTP fetcher - in real impl would use actual HTTP client
async function fetchSource(url: string, sourceType: string): Promise<{ content: string; timestamp: string }> {
  // In a real implementation, this would fetch the actual content
  // For now, return mock data
  return {
    content: `<html>
      <head><title>Example Product</title></head>
      <body>
        <div class="product-container">
          <h1 class="product-title">Amazing Product</h1>
          <p class="product-price">$99.99</p>
          <p class="product-description">This is an amazing product description.</p>
          <img class="product-image" src="https://example.com/image.jpg" alt="Product" />
          <span class="product-availability">in-stock</span>
        </div>
      </body>
    </html>`,
    timestamp: new Date().toISOString(),
  };
}

// Parse HTML content (simplified - real impl would use DOM parser)
function parseHtmlField(html: string, selector: string): { value: string | null; context: string } {
  // Simplified regex-based extraction for demonstration
  // Real impl would use a proper HTML/DOM parser
  const patterns: Record<string, RegExp> = {
    // More flexible patterns that handle various class name formats
    "title": /<h1[^>]*>([^<]+)<\/h1>/i,
    "price": /<p[^>]*class="[^"]*price[^"]*"[^>]*>\$?([0-9]+\.?[0-9]*)<\/p>/i,
    "description": /<p[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/p>/i,
    "imageUrl": /<img[^>]*src="([^"]+)"[^>]*>/i,
    "availability": /<span[^>]*class="[^"]*availability[^"]*"[^>]*>([^<]+)<\/span>/i,
    "headline": /<h1[^>]*>([^<]+)<\/h1>/i,
    "author": /<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/span>/i,
    "content": /<article[^>]*>([\s\S]*?)<\/article>/i,
  };

  const pattern = patterns[selector] || new RegExp(`<${selector}[^>]*>([^<]+)</${selector}>`, "i");
  const match = html.match(pattern);
  
  if (match) {
    // Get context around the match
    const index = html.indexOf(match[0]);
    const start = Math.max(0, index - 50);
    const end = Math.min(html.length, index + match[0].length + 50);
    return { value: match[1].trim(), context: html.substring(start, end) };
  }
  
  return { value: null, context: "" };
}

// Validate a single field against its schema definition
function validateField(
  fieldName: string,
  fieldDef: { type: string; required: boolean; pattern?: string; enumValues?: string[]; minLength?: number; maxLength?: number },
  value: unknown
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  if (value === undefined || value === null || value === "") {
    if (fieldDef.required) {
      errors.push({ field: fieldName, message: `Required field '${fieldName}' is missing`, severity: "error" });
    }
    return errors;
  }

  const strValue = String(value);

  // Type validation (simplified)
  switch (fieldDef.type) {
    case "number":
      if (isNaN(Number(strValue))) {
        errors.push({ field: fieldName, message: `Field '${fieldName}' must be a number`, severity: "error", value });
      }
      break;
    case "url":
      try {
        new URL(strValue);
      } catch {
        errors.push({ field: fieldName, message: `Field '${fieldName}' must be a valid URL`, severity: "error", value });
      }
      break;
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
        errors.push({ field: fieldName, message: `Field '${fieldName}' must be a valid email`, severity: "error", value });
      }
      break;
    case "date":
      if (isNaN(Date.parse(strValue))) {
        errors.push({ field: fieldName, message: `Field '${fieldName}' must be a valid date`, severity: "error", value });
      }
      break;
  }

  // Pattern validation
  if (fieldDef.pattern && typeof value === "string") {
    try {
      const regex = new RegExp(fieldDef.pattern);
      if (!regex.test(value)) {
        errors.push({ field: fieldName, message: `Field '${fieldName}' does not match expected pattern`, severity: "error", value });
      }
    } catch {
      // Invalid regex in schema, skip
    }
  }

  // Enum validation
  if (fieldDef.enumValues && !fieldDef.enumValues.includes(strValue)) {
    errors.push({ field: fieldName, message: `Field '${fieldName}' must be one of: ${fieldDef.enumValues.join(", ")}`, severity: "error", value });
  }

  // Length validation
  if (fieldDef.minLength && strValue.length < fieldDef.minLength) {
    errors.push({ field: fieldName, message: `Field '${fieldName}' must be at least ${fieldDef.minLength} characters`, severity: "error", value });
  }
  if (fieldDef.maxLength && strValue.length > fieldDef.maxLength) {
    errors.push({ field: fieldName, message: `Field '${fieldName}' must be at most ${fieldDef.maxLength} characters`, severity: "error", value });
  }

  return errors;
}

// Calculate confidence score based on multiple factors
function calculateConfidenceScore(
  fieldName: string,
  value: unknown,
  rawValue: string | null,
  validationErrors: ValidationError[],
  schema: ExtractionSchema
): { score: number; level: ConfidenceLevel; factors: Record<string, number> } {
  let score = 1.0;
  const factors: Record<string, number> = {};

  // Factor 1: Validation errors reduce confidence
  const errorCount = validationErrors.filter(e => e.field === fieldName).length;
  factors.validationErrors = Math.max(0, 1 - (errorCount * 0.2));

  // Factor 2: Presence of value
  if (value === undefined || value === null || value === "") {
    score *= 0.3;
    factors.presence = 0.3;
  } else {
    factors.presence = 1.0;
  }

  // Factor 3: Raw vs normalized match (high variance = lower confidence)
  if (rawValue && String(value) !== rawValue) {
    const similarity = calculateSimilarity(String(value), rawValue);
    factors.normalizationLoss = similarity;
    score *= (0.7 + similarity * 0.3);
  } else {
    factors.normalizationLoss = 1.0;
  }

  // Factor 4: Context availability
  factors.context = 0.9; // Simplified

  // Factor 5: Pattern match quality
  const fieldDef = schema.fields.find(f => f.name === fieldName);
  if (fieldDef?.pattern && typeof value === "string") {
    try {
      const matched = new RegExp(fieldDef.pattern).test(value);
      factors.patternMatch = matched ? 1.0 : 0.5;
      score *= factors.patternMatch;
    } catch {
      factors.patternMatch = 0.8;
    }
  } else {
    factors.patternMatch = 1.0;
  }

  // Normalize score
  const normalizedScore = Math.max(0, Math.min(1, score * factors.validationErrors));

  // Determine level
  let level: ConfidenceLevel;
  if (normalizedScore >= 0.8) level = "high";
  else if (normalizedScore >= 0.6) level = "medium";
  else if (normalizedScore >= 0.3) level = "low";
  else level = "unknown";

  return { score: normalizedScore, level, factors };
}

// Simple string similarity (Levenshtein-based approximation)
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  
  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Check for policy-sensitive content
function detectPolicySensitivity(
  fields: ExtractedField[],
  schema: ExtractionSchema
): PolicyFlag[] {
  const flags: PolicyFlag[] = [];
  
  for (const field of fields) {
    const fieldDef = schema.fields.find(f => f.name === field.name);
    if (fieldDef?.policySensitivity && fieldDef.policySensitivity !== "none") {
      flags.push({
        field: field.name,
        sensitivity: fieldDef.policySensitivity,
        description: `Field '${field.name}' flagged for ${fieldDef.policySensitivity} sensitivity`,
        flaggedAt: new Date().toISOString(),
      });
    }
    
    // Auto-detect potential sensitive patterns
    const valueStr = String(field.value).toLowerCase();
    
    // Check for potential personal data patterns
    if (field.name.toLowerCase().includes("ssn") || 
        /\b\d{3}-\d{2}-\d{4}\b/.test(valueStr)) {
      flags.push({
        field: field.name,
        sensitivity: "personal-data",
        description: `Potential SSN detected in field '${field.name}'`,
        flaggedAt: new Date().toISOString(),
      });
    }
    
    // Check for potential financial data
    if (field.name.toLowerCase().includes("credit") || 
        field.name.toLowerCase().includes("card") ||
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(valueStr)) {
      flags.push({
        field: field.name,
        sensitivity: "financial",
        description: `Potential credit card number detected in field '${field.name}'`,
        flaggedAt: new Date().toISOString(),
      });
    }
  }
  
  return flags;
}

// Detect drift against prior extraction
function detectDrift(
  currentContent: string,
  priorRun: ExtractionRun | null,
  schema: ExtractionSchema,
  sourceUrl: string
): DriftReport {
  const currentHash = hashContent(currentContent);
  const priorHash = priorRun?.sourceHash;
  
  const driftSignatures: DriftSignatureResult[] = [];
  
  // Check each drift signature
  for (const sig of schema.driftSignatures || []) {
    const pattern = typeof sig.pattern === "string" ? new RegExp(sig.pattern) : sig.pattern;
    const matched = pattern.test(currentContent);
    
    let priorValue: unknown;
    let currentValue: unknown;
    
    if (priorRun?.result) {
      const priorField = priorRun.result.fields.find(f => f.name === sig.field);
      priorValue = priorField?.value;
    }
    
    if (matched) {
      // Extract current value
      const extractResult = parseHtmlField(currentContent, sig.field);
      currentValue = extractResult.value;
    }
    
    driftSignatures.push({
      signature: sig,
      matched,
      priorValue,
      currentValue,
    });
  }
  
  // Determine impact
  let estimatedImpact: DriftReport["estimatedImpact"] = "none";
  const changedSignatures = driftSignatures.filter(s => !s.matched);
  const hasPriorRun = priorRun !== null && priorHash !== undefined;
  
  if (changedSignatures.length === 0 && hasPriorRun && priorHash !== currentHash) {
    estimatedImpact = "minor";
  } else if (changedSignatures.length > 0) {
    if (changedSignatures.length >= schema.driftSignatures!.length / 2) {
      estimatedImpact = "breaking";
    } else {
      estimatedImpact = "significant";
    }
  }
  
  return {
    detectedAt: new Date().toISOString(),
    sourceChanged: hasPriorRun && priorHash !== currentHash,
    sourceUrl,
    priorHash,
    currentHash,
    driftSignatures,
    estimatedImpact,
    priorExtractionId: priorRun?.id,
  };
}

// Build provenance info for an extracted field
function buildProvenance(
  sourceUrl: string,
  sourceTimestamp: string,
  method: ProvenanceInfo["extractionMethod"],
  selector?: string,
  matchedPattern?: string,
  contextBefore?: string,
  contextAfter?: string,
  transformSteps: string[] = []
): ProvenanceInfo {
  return {
    sourceUrl,
    sourceSelector: selector,
    sourceTimestamp,
    extractionMethod: method,
    matchedPattern,
    contextBefore,
    contextAfter,
    transformSteps,
  };
}

// Main extraction function
export async function executeExtraction(
  target: ExtractionTarget,
  schema: ExtractionSchema,
  options: ExtractionOptions = {}
): Promise<ExtractionExecutionResult> {
  const startTime = Date.now();
  const runId = evidenceStore.generateRunId();
  
  const run: ExtractionRun = {
    id: runId,
    targetId: target.id,
    schemaId: schema.id,
    status: "running",
    startedAt: new Date().toISOString(),
    sourceUrl: target.sourceUrl,
    sourceHash: "",
  };

  try {
    // Fetch source content
    const { content: sourceContent, timestamp: sourceTimestamp } = await fetchSource(
      target.sourceUrl,
      target.sourceType
    );
    
    const sourceHash = hashContent(sourceContent);
    run.sourceHash = sourceHash;

    // Get prior run for drift detection
    const priorRun = options.skipDriftCheck ? null : await evidenceStore.getPriorRun(target.id);

    // Extract fields based on schema
    const extractedFields: ExtractedField[] = [];
    const validationErrors: ValidationError[] = [];
    const validationWarnings: ValidationWarning[] = [];
    
    for (const fieldDef of schema.fields) {
      // Try to extract the field
      const extractResult = parseHtmlField(sourceContent, fieldDef.name);
      const rawValue = extractResult.value;
      
      let value: unknown = rawValue;
      const transformSteps: string[] = [];
      
      // Normalize value based on type
      if (rawValue !== null) {
        switch (fieldDef.type) {
          case "number":
            value = parseFloat(rawValue.replace(/[,$]/g, ""));
            if (!isNaN(value as number)) {
              transformSteps.push(`Parsed number: ${rawValue} -> ${value}`);
            }
            break;
          case "boolean":
            value = rawValue.toLowerCase() === "true" || rawValue === "1";
            transformSteps.push(`Parsed boolean: ${rawValue} -> ${value}`);
            break;
          case "url":
            // Ensure URL is absolute
            if (!rawValue.startsWith("http")) {
              const url = new URL(rawValue, target.sourceUrl);
              value = url.href;
              transformSteps.push(`Made URL absolute: ${rawValue} -> ${value}`);
            }
            break;
        }
      }
      
      // Validate field
      const fieldValidationErrors = validateField(fieldDef.name, fieldDef, value);
      validationErrors.push(...fieldValidationErrors);
      
      // Calculate confidence
      const confidenceResult = calculateConfidenceScore(
        fieldDef.name,
        value,
        rawValue,
        fieldValidationErrors,
        schema
      );
      
      // Build provenance
      const provenance = buildProvenance(
        target.sourceUrl,
        sourceTimestamp,
        "regex", // Using regex for mock extraction
        undefined,
        fieldDef.pattern,
        extractResult.context.substring(0, 50),
        extractResult.context.substring(extractResult.context.length - 50),
        transformSteps
      );
      
      extractedFields.push({
        name: fieldDef.name,
        value,
        confidence: confidenceResult.level,
        confidenceScore: confidenceResult.score,
        provenance,
        validationErrors: fieldValidationErrors.map(e => e.message),
        rawValue: rawValue || undefined,
      });
    }

    // Calculate overall confidence
    const totalConfidence = extractedFields.reduce((sum, f) => sum + f.confidenceScore, 0);
    const overallConfidence = extractedFields.length > 0 ? totalConfidence / extractedFields.length : 0;

    // Check required fields coverage
    const requiredFields = schema.fields.filter(f => f.required);
    const presentRequiredFields = requiredFields.filter(f => {
      const extracted = extractedFields.find(ef => ef.name === f.name);
      return extracted && extracted.value !== undefined && extracted.value !== null && extracted.value !== "";
    });
    const requiredCoverage = requiredFields.length > 0 ? presentRequiredFields.length / requiredFields.length : 1;

    // Detect policy sensitivity
    const policyFlags = detectPolicySensitivity(extractedFields, schema);

    // Validation result
    const criticalErrors = validationErrors.filter(e => e.severity === "critical");
    const validationResult: ValidationResult = {
      isValid: criticalErrors.length === 0,
      errors: validationErrors,
      warnings: validationWarnings,
      validatedFields: extractedFields.map(f => f.name),
    };

    // Determine status
    let status: ExtractionResult["status"] = "success";
    let failureEvidence: FailureEvidence | undefined;
    
    // Check for policy sensitivity
    if (policyFlags.length > 0) {
      status = "policy-sensitive";
      failureEvidence = buildFailureEvidence(
        "policy-sensitive",
        target,
        schema,
        extractedFields,
        sourceContent,
        policyFlags,
        overallConfidence
      );
    }
    // Check for drift
    else if (!options.skipDriftCheck) {
      const driftReport = detectDrift(sourceContent, priorRun, schema, target.sourceUrl);
      
      if (driftReport.estimatedImpact !== "none") {
        status = "drift-detected";
        
        // Build drift failure evidence
        failureEvidence = {
          type: "drift",
          timestamp: new Date().toISOString(),
          sourceUrl: target.sourceUrl,
          schemaId: schema.id,
          details: `Drift detected: ${driftReport.estimatedImpact} impact with ${driftReport.driftSignatures.filter(s => !s.matched).length} changed signatures`,
          preservedCapture: {
            sourceUrl: target.sourceUrl,
            sourceContent: options.preserveRawContent ? sourceContent.substring(0, 10000) : undefined,
            rawExtraction: Object.fromEntries(extractedFields.map(f => [f.name, f.rawValue || f.value])),
          },
          recoveryGuidance: [
            "Review drift report for changed signatures",
            "Update extraction selectors or patterns",
            "Re-validate extracted data quality",
          ],
          canRetry: true,
        };
      }
    }
    
    // Check for low confidence (after policy/drift checks)
    if (status === "success") {
      const belowThresholdFields = extractedFields.filter(
        f => f.confidenceScore < schema.confidenceThresholds.fieldMinConfidence
      );
      
      if (belowThresholdFields.length > 0 || overallConfidence < schema.confidenceThresholds.overallMinConfidence) {
        if (requiredCoverage < schema.confidenceThresholds.requiredFieldsCoverage) {
          status = "low-confidence";
          failureEvidence = buildFailureEvidence(
            "low-confidence",
            target,
            schema,
            extractedFields,
            sourceContent,
            [],
            overallConfidence
          );
        } else {
          status = "partial-success";
        }
      }
    }
    
    // Build final result
    const result: ExtractionResult = {
      id: runId,
      schemaId: schema.id,
      schemaVersion: schema.version,
      status,
      sourceUrl: target.sourceUrl,
      sourceHash,
      extractedAt: new Date().toISOString(),
      extractionMs: Date.now() - startTime,
      fields: extractedFields,
      overallConfidence,
      validationResult,
      failureEvidence,
      warnings: [
        ...belowThresholdFieldsMessage(extractedFields, schema.confidenceThresholds.fieldMinConfidence),
        ...(requiredCoverage < 1 ? [`Required fields coverage: ${(requiredCoverage * 100).toFixed(0)}%`] : []),
      ],
    };

    // Update run status based on extraction status
    run.status = (status === "success" || status === "partial-success") ? "completed" : "partial";
    run.completedAt = new Date().toISOString();
    run.result = result;
    
    // Save run
    await evidenceStore.saveRun(run);
    
    return {
      success: status === "success" || status === "partial-success",
      run,
      executedAt: new Date().toISOString(),
      executionMs: Date.now() - startTime,
    };
    
  } catch (error) {
    run.status = "failed";
    run.completedAt = new Date().toISOString();
    run.error = String(error);
    await evidenceStore.saveRun(run);
    
    return {
      success: false,
      run,
      executedAt: new Date().toISOString(),
      executionMs: Date.now() - startTime,
      error: String(error),
    };
  }
}

// Helper to build failure evidence
function buildFailureEvidence(
  type: FailureEvidence["type"],
  target: ExtractionTarget,
  schema: ExtractionSchema,
  fields: ExtractedField[],
  sourceContent: string,
  policyFlags: PolicyFlag[],
  confidence: number
): FailureEvidence {
  const confidenceFactors: Record<string, number> = {};
  for (const field of fields) {
    confidenceFactors[field.name] = field.confidenceScore;
  }
  
  return {
    type,
    timestamp: new Date().toISOString(),
    sourceUrl: target.sourceUrl,
    schemaId: schema.id,
    details: type === "low-confidence"
      ? `Extraction confidence (${(confidence * 100).toFixed(0)}%) below threshold (${(schema.confidenceThresholds.overallMinConfidence * 100).toFixed(0)}%)`
      : type === "policy-sensitive"
        ? `Policy-sensitive content detected in ${policyFlags.length} fields`
        : "Extraction failed",
    preservedCapture: {
      sourceUrl: target.sourceUrl,
      sourceContent: sourceContent.substring(0, 10000),
      rawExtraction: Object.fromEntries(fields.map(f => [f.name, f.rawValue || f.value])),
      confidenceFactors,
      policyFlags,
    },
    recoveryGuidance: type === "low-confidence"
      ? [
          "Review low-confidence fields and their extraction selectors",
          "Consider adding alternative selectors or fallback patterns",
          "If content is genuinely variable, update confidence thresholds",
        ]
      : type === "policy-sensitive"
        ? [
            "Review flagged fields for sensitive content",
            "Apply appropriate masking or filtering before downstream use",
            "Consult privacy/compliance team if needed",
          ]
        : [
            "Check source URL accessibility",
            "Verify schema selectors are still valid",
            "Review extraction logs for specific errors",
          ],
    canRetry: true,
    retryAfterSeconds: type === "low-confidence" ? 300 : 60,
  };
}

// Helper for below-threshold field messages
function belowThresholdFieldsMessage(fields: ExtractedField[], threshold: number): string[] {
  const belowThreshold = fields.filter(f => f.confidenceScore < threshold);
  if (belowThreshold.length === 0) return [];
  
  return [
    `Fields below confidence threshold (${(threshold * 100).toFixed(0)}%): ${belowThreshold.map(f => `${f.name} (${(f.confidenceScore * 100).toFixed(0)}%)`).join(", ")}`,
  ];
}

// Get extraction run
export async function getExtractionRun(runId: string): Promise<ExtractionRun | null> {
  return evidenceStore.getRun(runId);
}

// List extraction runs
export async function listExtractionRuns(targetId?: string, limit?: number): Promise<ExtractionRun[]> {
  return evidenceStore.listRuns(targetId, limit);
}

// Get schema
export async function getSchema(schemaId: string): Promise<ExtractionSchema | null> {
  return evidenceStore.getSchema(schemaId);
}

// List schemas
export async function listSchemas(): Promise<ExtractionSchema[]> {
  return evidenceStore.listSchemas();
}

// Get target
export async function getTarget(targetId: string): Promise<ExtractionTarget | null> {
  return evidenceStore.getTarget(targetId);
}

// List targets
export async function listTargets(): Promise<ExtractionTarget[]> {
  return evidenceStore.listTargets();
}

// Detect drift for a target
export async function detectDriftForTarget(targetId: string): Promise<DriftReport | null> {
  const target = await evidenceStore.getTarget(targetId);
  if (!target) return null;
  
  const schema = await evidenceStore.getSchema(target.schemaId);
  if (!schema) return null;
  
  const priorRun = await evidenceStore.getPriorRun(targetId);
  const { content } = await fetchSource(target.sourceUrl, target.sourceType);
  
  return detectDrift(content, priorRun, schema, target.sourceUrl);
}
