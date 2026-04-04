/**
 * Trawl Web Extraction - Core Types
 * 
 * Defines types for schema-guided extraction, provenance tracking,
 * confidence scoring, drift detection, and failure classification.
 */

// Field confidence levels
export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

// Extraction status
export type ExtractionStatus = 
  | "success" 
  | "partial-success" 
  | "low-confidence" 
  | "drift-detected"
  | "policy-sensitive"
  | "failed";

// Policy sensitivity classification
export type PolicySensitivity = 
  | "none" 
  | "personal-data" 
  | "financial" 
  | "health" 
  | "children" 
  | "legal" 
  | "restricted";

// Schema field definition
export interface SchemaField {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object" | "date" | "url" | "email";
  required: boolean;
  description?: string;
  pattern?: string; // Regex pattern for validation
  minLength?: number;
  maxLength?: number;
  enumValues?: string[]; // Allowed values
  policySensitivity?: PolicySensitivity;
}

// Extraction target schema
export interface ExtractionSchema {
  id: string;
  name: string;
  version: string;
  description?: string;
  fields: SchemaField[];
  driftSignatures?: DriftSignature[]; // Patterns that indicate drift
  confidenceThresholds: ConfidenceThresholds;
  createdAt: string;
  updatedAt: string;
}

// Confidence thresholds for extraction decisions
export interface ConfidenceThresholds {
  fieldMinConfidence: number; // 0-1, below this field is marked low-confidence
  overallMinConfidence: number; // 0-1, below this extraction fails loudly
  requiredFieldsCoverage: number; // 0-1, required fields must meet this coverage
}

// Patterns that indicate source drift
export interface DriftSignature {
  field: string;
  selector?: string; // CSS/XPath selector
  pattern: string | RegExp;
  expectedOccurrence?: number;
  description: string;
}

// Field-level extraction result with provenance
export interface ExtractedField {
  name: string;
  value: unknown;
  confidence: ConfidenceLevel;
  confidenceScore: number; // 0-1 numeric score
  provenance: ProvenanceInfo;
  validationErrors?: string[];
  rawValue?: string; // Original extracted value before normalization
}

// Provenance tracking for extracted data
export interface ProvenanceInfo {
  sourceUrl: string;
  sourceSelector?: string; // CSS/XPath used to extract
  sourceTimestamp: string; // When the source was fetched
  extractionMethod: "css-selector" | "xpath" | "regex" | "llm" | "heuristic" | "json-ld" | "microdata";
  matchedPattern?: string;
  contextBefore?: string; // Snippet before the extracted value
  contextAfter?: string; // Snippet after the extracted value
  transformSteps: string[]; // Steps taken to normalize the value
}

// Complete extraction result
export interface ExtractionResult {
  id: string;
  schemaId: string;
  schemaVersion: string;
  status: ExtractionStatus;
  sourceUrl: string;
  sourceHash: string; // Hash of source content for drift detection
  extractedAt: string;
  extractionMs: number;
  fields: ExtractedField[];
  overallConfidence: number; // 0-1 weighted average
  validationResult: ValidationResult;
  driftReport?: DriftReport;
  failureEvidence?: FailureEvidence;
  warnings: string[];
}

// Schema validation result
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  validatedFields: string[]; // Fields that passed validation
}

// Validation error
export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "critical";
  value?: unknown;
}

// Validation warning
export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// Drift detection report
export interface DriftReport {
  detectedAt: string;
  sourceChanged: boolean;
  sourceUrl: string;
  priorHash?: string;
  currentHash: string;
  driftSignatures: DriftSignatureResult[];
  estimatedImpact: "none" | "minor" | "significant" | "breaking";
  priorExtractionId?: string;
}

// Individual drift signature result
export interface DriftSignatureResult {
  signature: DriftSignature;
  matched: boolean;
  priorValue?: unknown;
  currentValue?: unknown;
  driftMagnitude?: number; // How much the value changed
}

// Failure evidence for low-confidence or policy-sensitive cases
export interface FailureEvidence {
  type: "low-confidence" | "policy-sensitive" | "drift" | "schema-validation" | "extraction-error";
  timestamp: string;
  sourceUrl: string;
  schemaId: string;
  details: string;
  preservedCapture: PreservedCapture;
  recoveryGuidance: string[];
  canRetry: boolean;
  retryAfterSeconds?: number;
}

// Preserved raw capture for debugging/review
export interface PreservedCapture {
  sourceUrl: string;
  sourceContent?: string; // Full or truncated HTML/text
  rawExtraction?: Record<string, unknown>; // Raw extracted values before normalization
  errorContext?: string;
  attemptedSelectors?: string[];
  confidenceFactors?: Record<string, number>; // What affected confidence scoring
  policyFlags?: PolicyFlag[];
}

// Policy flag for sensitive content
export interface PolicyFlag {
  field: string;
  sensitivity: PolicySensitivity;
  description: string;
  flaggedAt: string;
}

// Extraction target definition
export interface ExtractionTarget {
  id: string;
  name: string;
  schemaId: string;
  sourceUrl: string;
  sourceType: "html" | "json" | "xml" | "rss" | "atom" | "pdf" | "api";
  owner?: string;
  cadence?: string;
  tags?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Historical extraction run
export interface ExtractionRun {
  id: string;
  targetId: string;
  schemaId: string;
  status: "running" | "completed" | "partial" | "failed";
  startedAt: string;
  completedAt?: string;
  sourceUrl: string;
  sourceHash: string;
  result?: ExtractionResult;
  error?: string;
}

// Evidence store operations interface
export interface ExtractionEvidenceStore {
  saveRun(run: ExtractionRun): Promise<void>;
  getRun(runId: string): Promise<ExtractionRun | null>;
  getPriorRun(targetId: string, beforeRunId?: string): Promise<ExtractionRun | null>;
  listRuns(targetId?: string, limit?: number): Promise<ExtractionRun[]>;
  listTargets(): Promise<ExtractionTarget[]>;
  getTarget(targetId: string): Promise<ExtractionTarget | null>;
  saveTarget(target: ExtractionTarget): Promise<void>;
  listSchemas(): Promise<ExtractionSchema[]>;
  getSchema(schemaId: string): Promise<ExtractionSchema | null>;
  saveSchema(schema: ExtractionSchema): Promise<void>;
}

// Extraction options
export interface ExtractionOptions {
  targetId?: string;
  schemaId?: string;
  sourceUrl?: string;
  forceExtraction?: boolean; // Even if confidence is low
  skipDriftCheck?: boolean;
  preserveRawContent?: boolean;
}

// Extraction execution result
export interface ExtractionExecutionResult {
  success: boolean;
  run: ExtractionRun;
  executedAt: string;
  executionMs: number;
  error?: string;
}

// Action API types
export interface ExtractParams {
  targetId?: string;
  schemaId?: string;
  sourceUrl?: string;
  forceExtraction?: boolean;
}

export interface ValidateSchemaParams {
  schemaId: string;
}

export interface DetectDriftParams {
  targetId: string;
}

export interface GetExtractionRunsParams {
  targetId?: string;
  limit?: number;
}
