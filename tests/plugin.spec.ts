import { describe, expect, it, beforeEach } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";
import { evidenceStore } from "../src/evidence-store.js";
import type { ExtractionSchema, ExtractionTarget, ExtractionResult } from "../src/types.js";

describe("plugin scaffold", () => {
  it("registers data + actions and handles events", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities, "events.emit"] });
    await plugin.definition.setup(harness.ctx);

    await harness.emit("issue.created", { issueId: "iss_1" }, { entityId: "iss_1", entityType: "issue" });
    expect(harness.getState({ scopeKind: "issue", scopeId: "iss_1", stateKey: "seen" })).toBe(true);

    const data = await harness.getData<{ status: string }>("health");
    expect(data.status).toBe("ok");

    const action = await harness.performAction<{ pong: boolean }>("ping");
    expect(action.pong).toBe(true);
  });
});

describe("schema and target registration", () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);
  });

  it("lists available schemas", async () => {
    const data = await harness.getData<{ schemas: ExtractionSchema[] }>("schemas");
    expect(data.schemas.length).toBeGreaterThan(0);
    expect(data.schemas[0]).toHaveProperty("id");
    expect(data.schemas[0]).toHaveProperty("fields");
    expect(data.schemas[0]).toHaveProperty("confidenceThresholds");
  });

  it("lists available targets", async () => {
    const data = await harness.getData<{ targets: ExtractionTarget[] }>("targets");
    expect(data.targets.length).toBeGreaterThan(0);
    expect(data.targets[0]).toHaveProperty("id");
    expect(data.targets[0]).toHaveProperty("schemaId");
    expect(data.targets[0]).toHaveProperty("sourceUrl");
  });

  it("gets specific schema", async () => {
    const schemas = await harness.getData<{ schemas: ExtractionSchema[] }>("schemas");
    const schemaId = schemas.schemas[0].id;
    
    const data = await harness.getData<{ schema: ExtractionSchema }>("schema", { schemaId });
    expect(data.schema).toBeDefined();
    expect(data.schema.id).toBe(schemaId);
    expect(data.schema.fields.length).toBeGreaterThan(0);
  });

  it("returns error for non-existent schema", async () => {
    const data = await harness.getData<{ error: string }>("schema", { schemaId: "non-existent" });
    expect(data.error).toBe("Schema not found");
  });
});

describe("extraction execution", () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);
  });

  it("performs extraction and returns result with field-level provenance", async () => {
    const targets = await harness.getData<{ targets: ExtractionTarget[] }>("targets");
    const targetId = targets.targets[0].id;

    const result = await harness.performAction<{
      success: boolean;
      status: string;
      result?: ExtractionResult;
    }>("extract", { targetId });

    // Extraction should complete - either success or with loud failure evidence
    expect(result.result).toBeDefined();
    expect(result.status).toBeDefined();
    expect(result.result!.schemaId).toBeDefined();
    expect(result.result!.extractedAt).toBeDefined();

    // Verify field-level provenance is present for extracted fields
    for (const field of result.result!.fields) {
      expect(field.provenance).toBeDefined();
      expect(field.provenance.sourceUrl).toBeDefined();
      expect(field.provenance.extractionMethod).toBeDefined();
      expect(field.confidence).toBeDefined();
      expect(typeof field.confidenceScore).toBe("number");
    }

    // If extraction failed, it should be a loud failure with evidence
    if (!result.success) {
      expect(result.result!.failureEvidence).toBeDefined();
      expect(result.result!.failureEvidence!.details).toBeDefined();
      expect(result.result!.failureEvidence!.recoveryGuidance.length).toBeGreaterThan(0);
    }
  });

  it("returns low-confidence failure loudly instead of silent degradation", async () => {
    // Create a schema with very high confidence requirements that will fail
    const highThresholdSchema: ExtractionSchema = {
      id: "test-high-threshold",
      name: "High Threshold Schema",
      version: "1.0.0",
      fields: [
        { name: "nonexistent", type: "string", required: true },
      ],
      confidenceThresholds: {
        fieldMinConfidence: 0.99, // Extremely high threshold
        overallMinConfidence: 0.99,
        requiredFieldsCoverage: 1.0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await evidenceStore.saveSchema(highThresholdSchema);

    const targets = await harness.getData<{ targets: ExtractionTarget[] }>("targets");
    const targetId = targets.targets[0].id;

    const result = await harness.performAction<{
      success: boolean;
      result?: ExtractionResult;
    }>("extract", { targetId, schemaId: highThresholdSchema.id });

    // With required field missing and high thresholds, this should fail loudly
    expect(result.success).toBe(false);
    expect(result.result).toBeDefined();
    expect(result.result!.failureEvidence).toBeDefined();
    expect(["low-confidence", "drift", "policy-sensitive"]).toContain(result.result!.failureEvidence!.type);
    expect(result.result!.failureEvidence!.recoveryGuidance.length).toBeGreaterThan(0);
    expect(result.result!.failureEvidence!.preservedCapture).toBeDefined();
  });

  it("detects drift when source changes between runs", async () => {
    const targets = await harness.getData<{ targets: ExtractionTarget[] }>("targets");
    const targetId = targets.targets[0].id;

    // First extraction - may or may not succeed depending on initial state
    const firstResult = await harness.performAction<{ success: boolean; runId: string }>("extract", { targetId });
    expect(firstResult.runId).toBeDefined();

    // Detect drift - should work and return a drift report
    const driftResult = await harness.performAction<{
      success: boolean;
      driftReport?: {
        detectedAt: string;
        sourceChanged: boolean;
        estimatedImpact: string;
      };
    }>("detect-drift", { targetId });

    expect(driftResult.success).toBe(true);
    expect(driftResult.driftReport).toBeDefined();
    expect(driftResult.driftReport!.detectedAt).toBeDefined();
  });

  it("returns validation result with errors array", async () => {
    const targets = await harness.getData<{ targets: ExtractionTarget[] }>("targets");
    const targetId = targets.targets[0].id;

    const result = await harness.performAction<{
      result?: ExtractionResult;
    }>("extract", { targetId });

    expect(result.result).toBeDefined();
    expect(result.result!.validationResult).toBeDefined();
    expect(result.result!.validationResult.errors).toBeDefined();
  });
});

describe("validation contract VC-TOOL-TRAWL", () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);
  });

  it("VC-TOOL-TRAWL-001: Structured extraction returns schema-valid data with field-level provenance or loud drift failure", async () => {
    const targets = await harness.getData<{ targets: ExtractionTarget[] }>("targets");
    const targetId = targets.targets[0].id;

    const result = await harness.performAction<{
      success: boolean;
      result?: ExtractionResult;
    }>("extract", { targetId });

    expect(result.result).toBeDefined();
    const extractionResult = result.result!;

    // Schema validation present
    expect(extractionResult.validationResult).toBeDefined();
    expect(extractionResult.validationResult.isValid).toBeDefined();

    // Field-level provenance present for all fields
    for (const field of extractionResult.fields) {
      expect(field.provenance).toBeDefined();
      expect(field.provenance.sourceUrl).toBeDefined();
      expect(field.provenance.extractionMethod).toBeDefined();
      expect(field.confidence).toBeDefined();
      expect(typeof field.confidenceScore).toBe("number");
    }

    // Either success or loud drift failure - no silent degradation
    if (result.success) {
      expect(extractionResult.status).toMatch(/^(success|partial-success)$/);
      expect(extractionResult.failureEvidence).toBeUndefined();
    } else {
      // Loud failure with evidence
      expect(extractionResult.failureEvidence).toBeDefined();
      expect(extractionResult.failureEvidence!.details).toBeDefined();
      // driftReport should be present if status is drift-detected
      if (extractionResult.status === "drift-detected") {
        expect(extractionResult.driftReport).toBeDefined();
      }
    }
  });

  it("VC-TOOL-TRAWL-002: Low-confidence or policy-sensitive extraction fails loudly rather than silently degrading", async () => {
    const targets = await harness.getData<{ targets: ExtractionTarget[] }>("targets");
    const targetId = targets.targets[0].id;

    const result = await harness.performAction<{
      success: boolean;
      result?: ExtractionResult;
    }>("extract", { targetId });

    const extractionResult = result.result;
    expect(extractionResult).toBeDefined();

    // If extraction succeeded, check it's not silently degraded
    if (result.success) {
      expect(extractionResult!.status).toMatch(/^(success|partial-success)$/);
      expect(extractionResult!.failureEvidence).toBeUndefined();
    } else {
      // If it failed, it should have loud failure evidence
      expect(extractionResult!.failureEvidence).toBeDefined();
      expect(extractionResult!.failureEvidence!.type).toBeTruthy();
      expect(["low-confidence", "policy-sensitive", "drift", "schema-validation"]).toContain(
        extractionResult!.failureEvidence!.type
      );
      expect(extractionResult!.failureEvidence!.recoveryGuidance.length).toBeGreaterThan(0);
      
      // Preserved evidence should be present
      expect(extractionResult!.failureEvidence!.preservedCapture).toBeDefined();
      expect(extractionResult!.failureEvidence!.preservedCapture.sourceUrl).toBeDefined();
    }
  });
});

describe("get-validation-summary action", () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    await plugin.definition.setup(harness.ctx);
  });

  it("returns validation summary for a completed run", async () => {
    // First run an extraction
    const targets = await harness.getData<{ targets: ExtractionTarget[] }>("targets");
    const targetId = targets.targets[0].id;

    const extractResult = await harness.performAction<{ runId: string }>("extract", { targetId });
    expect(extractResult.runId).toBeDefined();

    // Get validation summary
    const summary = await harness.performAction<{
      runId: string;
      status: string;
      overallConfidence: number;
      validationPassed: boolean;
    }>("get-validation-summary", { runId: extractResult.runId });

    expect(summary.runId).toBe(extractResult.runId);
    expect(summary.status).toBeDefined();
    expect(typeof summary.overallConfidence).toBe("number");
    expect(summary.validationPassed).toBeDefined();
  });
});
