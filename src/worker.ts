import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import {
  executeExtraction,
  getExtractionRun,
  listExtractionRuns,
  listSchemas,
  getSchema,
  listTargets,
  getTarget,
  detectDriftForTarget,
} from "./extraction-engine.js";
import type {
  ExtractionOptions,
  ExtractionTarget,
  ExtractionSchema,
} from "./types.js";

const plugin = definePlugin({
  async setup(ctx) {
    // Basic event handling - observe issues
    ctx.events.on("issue.created", async (event) => {
      const issueId = event.entityId ?? "unknown";
      await ctx.state.set({ scopeKind: "issue", scopeId: issueId, stateKey: "seen" }, true);
      ctx.logger.info("Observed issue.created", { issueId });
    });

    // Health check
    ctx.data.register("health", async () => {
      return { status: "ok", checkedAt: new Date().toISOString() };
    });

    // List available extraction schemas
    ctx.data.register("schemas", async () => {
      const schemas = await listSchemas();
      return { schemas };
    });

    // Get specific schema
    ctx.data.register("schema", async (params: Record<string, unknown>) => {
      const schemaId = params.schemaId as string;
      const schema = await getSchema(schemaId);
      if (!schema) {
        return { error: "Schema not found", schemaId };
      }
      return { schema };
    });

    // List extraction targets
    ctx.data.register("targets", async () => {
      const targets = await listTargets();
      return { targets };
    });

    // Get specific target
    ctx.data.register("target", async (params: Record<string, unknown>) => {
      const targetId = params.targetId as string;
      const target = await getTarget(targetId);
      if (!target) {
        return { error: "Target not found", targetId };
      }
      return { target };
    });

    // Get extraction run details
    ctx.data.register("extraction-run", async (params: Record<string, unknown>) => {
      const runId = params.runId as string;
      const run = await getExtractionRun(runId);
      if (!run) {
        return { error: "Run not found", runId };
      }
      return { run };
    });

    // List recent extraction runs
    ctx.data.register("extraction-runs", async (params: Record<string, unknown>) => {
      const targetId = params.targetId as string | undefined;
      const limit = (params.limit as number) ?? 10;
      const runs = await listExtractionRuns(targetId, limit);
      return { runs };
    });

    // Ping action
    ctx.actions.register("ping", async () => {
      ctx.logger.info("Ping action invoked");
      return { pong: true, at: new Date().toISOString() };
    });

    // Extract action - performs structured extraction
    ctx.actions.register("extract", async (params: Record<string, unknown>) => {
      const targetId = params.targetId as string | undefined;
      const schemaId = params.schemaId as string | undefined;
      const sourceUrl = params.sourceUrl as string | undefined;
      const forceExtraction = params.forceExtraction as boolean | undefined;

      ctx.logger.info("Starting extraction", { targetId, schemaId, sourceUrl });

      try {
        // If sourceUrl provided without targetId, we need schemaId
        if (sourceUrl && !targetId && !schemaId) {
          return {
            success: false,
            error: "When providing sourceUrl, either targetId or schemaId must be provided",
          };
        }

        // Get target and schema
        let target: ExtractionTarget | null = null;
        let schema: ExtractionSchema | null = null;

        if (targetId) {
          target = await getTarget(targetId);
          if (!target) {
            return { success: false, error: `Target not found: ${targetId}` };
          }
          if (!target.enabled) {
            return { success: false, error: `Target is disabled: ${targetId}` };
          }
          schema = await getSchema(target.schemaId);
          if (!schema) {
            return { success: false, error: `Schema not found for target: ${target.schemaId}` };
          }
        } else if (schemaId) {
          schema = await getSchema(schemaId);
          if (!schema) {
            return { success: false, error: `Schema not found: ${schemaId}` };
          }
          if (targetId) {
            target = await getTarget(targetId);
          }
        }

        // If we have sourceUrl but no target, we need to create a temporary target
        if (!target && sourceUrl) {
          target = {
            id: `temp-${Date.now()}`,
            name: "Temporary Target",
            schemaId: schema!.id,
            sourceUrl,
            sourceType: "html",
            enabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }

        if (!target) {
          return { success: false, error: "No target available for extraction" };
        }

        const options: ExtractionOptions = {
          forceExtraction,
          preserveRawContent: true,
        };

        const result = await executeExtraction(target, schema!, options);

        // Log summary for operators
        ctx.logger.info("Extraction completed", {
          runId: result.run.id,
          status: result.run.status,
          fieldCount: result.run.result?.fields.length,
          overallConfidence: result.run.result?.overallConfidence,
          validationErrors: result.run.result?.validationResult.errors.length,
          driftDetected: !!result.run.result?.driftReport,
          failureEvidence: !!result.run.result?.failureEvidence,
        });

        return {
          success: result.success,
          runId: result.run.id,
          status: result.run.status,
          result: result.run.result ? {
            id: result.run.result.id,
            schemaId: result.run.result.schemaId,
            status: result.run.result.status,
            sourceUrl: result.run.result.sourceUrl,
            extractedAt: result.run.result.extractedAt,
            extractionMs: result.run.result.extractionMs,
            fields: result.run.result.fields.map(f => ({
              name: f.name,
              value: f.value,
              confidence: f.confidence,
              confidenceScore: f.confidenceScore,
              provenance: f.provenance,
              validationErrors: f.validationErrors,
            })),
            overallConfidence: result.run.result.overallConfidence,
            validationResult: result.run.result.validationResult,
            driftReport: result.run.result.driftReport ? {
              detectedAt: result.run.result.driftReport.detectedAt,
              sourceChanged: result.run.result.driftReport.sourceChanged,
              estimatedImpact: result.run.result.driftReport.estimatedImpact,
              driftSignatures: result.run.result.driftReport.driftSignatures.map(ds => ({
                field: ds.signature.field,
                matched: ds.matched,
                description: ds.signature.description,
              })),
            } : undefined,
            failureEvidence: result.run.result.failureEvidence ? {
              type: result.run.result.failureEvidence.type,
              timestamp: result.run.result.failureEvidence.timestamp,
              details: result.run.result.failureEvidence.details,
              recoveryGuidance: result.run.result.failureEvidence.recoveryGuidance,
              canRetry: result.run.result.failureEvidence.canRetry,
              preservedCapture: result.run.result.failureEvidence.preservedCapture,
            } : undefined,
            warnings: result.run.result.warnings,
          } : undefined,
          executedAt: result.executedAt,
          executionMs: result.executionMs,
          error: result.error,
        };
      } catch (error) {
        ctx.logger.error("Extraction failed", { error: String(error) });
        return {
          success: false,
          error: String(error),
        };
      }
    });

    // Detect drift for a target
    ctx.actions.register("detect-drift", async (params: Record<string, unknown>) => {
      const targetId = params.targetId as string;
      
      ctx.logger.info("Detecting drift", { targetId });
      
      try {
        const driftReport = await detectDriftForTarget(targetId);
        
        if (!driftReport) {
          return { success: false, error: "Target not found or no prior extraction" };
        }

        return {
          success: true,
          driftReport,
        };
      } catch (error) {
        ctx.logger.error("Drift detection failed", { error: String(error) });
        return {
          success: false,
          error: String(error),
        };
      }
    });

    // Get validation summary
    ctx.actions.register("get-validation-summary", async (params: Record<string, unknown>) => {
      const runId = params.runId as string;
      
      const run = await getExtractionRun(runId);
      if (!run || !run.result) {
        return { error: "Run not found or not completed" };
      }

      const result = run.result;
      const schema = await getSchema(result.schemaId);
      
      const summary = {
        runId,
        status: result.status,
        overallConfidence: result.overallConfidence,
        confidenceThreshold: schema?.confidenceThresholds.overallMinConfidence,
        validationPassed: result.validationResult.isValid,
        criticalErrors: result.validationResult.errors.filter(e => e.severity === "critical").length,
        fieldValidations: result.fields.map(f => ({
          name: f.name,
          confidence: f.confidence,
          confidenceScore: f.confidenceScore,
          hasErrors: (f.validationErrors?.length ?? 0) > 0,
          provenance: {
            sourceUrl: f.provenance.sourceUrl,
            extractionMethod: f.provenance.extractionMethod,
            hasContext: !!f.provenance.contextBefore || !!f.provenance.contextAfter,
          },
        })),
        driftDetected: !!result.driftReport,
        failureEvidence: result.failureEvidence ? {
          type: result.failureEvidence.type,
          details: result.failureEvidence.details,
          recoveryGuidance: result.failureEvidence.recoveryGuidance,
        } : null,
      };

      return summary;
    });
  },

  async onHealth() {
    return { status: "ok", message: "Trawl Web Extraction plugin worker is running" };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
