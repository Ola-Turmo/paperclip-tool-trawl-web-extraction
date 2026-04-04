/**
 * Trawl Web Extraction - Evidence Store
 * 
 * In-memory evidence store for extraction runs, targets, and schemas.
 */

import type {
  ExtractionEvidenceStore,
  ExtractionRun,
  ExtractionTarget,
  ExtractionSchema,
} from "./types.js";

const RUNS_KEY = "extraction_runs";
const TARGETS_KEY = "extraction_targets";
const SCHEMAS_KEY = "extraction_schemas";
const PRIOR_RUNS_INDEX = "prior_runs_index"; // targetId -> runIds[]

export class InMemoryExtractionEvidenceStore implements ExtractionEvidenceStore {
  private runs: Map<string, ExtractionRun> = new Map();
  private targets: Map<string, ExtractionTarget> = new Map();
  private schemas: Map<string, ExtractionSchema> = new Map();
  private targetRunsIndex: Map<string, string[]> = new Map(); // targetId -> ordered runIds (newest first)

  private runIdCounter = 0;
  private targetIdCounter = 0;
  private schemaIdCounter = 0;

  constructor() {
    // Initialize with some example schemas and targets for testing
    this.initializeExampleData();
  }

  private initializeExampleData() {
    // Example schema for product extraction
    const productSchema: ExtractionSchema = {
      id: "schema-product-001",
      name: "Product Schema",
      version: "1.0.0",
      description: "Standard product information schema",
      fields: [
        { name: "title", type: "string", required: true, description: "Product title" },
        { name: "price", type: "number", required: true, description: "Product price" },
        { name: "currency", type: "string", required: true, description: "Price currency code" },
        { name: "description", type: "string", required: false, description: "Product description" },
        { name: "imageUrl", type: "url", required: false, description: "Product image URL" },
        { name: "availability", type: "string", required: false, enumValues: ["in-stock", "out-of-stock", "limited"] },
      ],
      driftSignatures: [
        { field: "title", pattern: "class=\"[^\"]*product[^\"]*\"", description: "Product container class change" },
        { field: "price", selector: "[class*='price']", pattern: "\\$?[0-9]+(\\.[0-9]{2})?", description: "Price element change" },
      ],
      confidenceThresholds: {
        fieldMinConfidence: 0.6,
        overallMinConfidence: 0.7,
        requiredFieldsCoverage: 0.8,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Example schema for article extraction
    const articleSchema: ExtractionSchema = {
      id: "schema-article-001",
      name: "Article Schema",
      version: "1.0.0",
      description: "Web article/blog post schema",
      fields: [
        { name: "headline", type: "string", required: true, description: "Article headline" },
        { name: "author", type: "string", required: false, description: "Article author" },
        { name: "publishedDate", type: "date", required: false, description: "Publication date" },
        { name: "content", type: "string", required: true, description: "Article content" },
        { name: "url", type: "url", required: true, description: "Article URL" },
      ],
      driftSignatures: [
        { field: "headline", selector: "h1", pattern: "<h1[^>]*>", description: "H1 tag structure change" },
        { field: "content", selector: "article, [class*='content'], [class*='body']", pattern: "<article|<div class=\"[^\"]*content[^\"]*\"", description: "Content container change" },
      ],
      confidenceThresholds: {
        fieldMinConfidence: 0.5,
        overallMinConfidence: 0.65,
        requiredFieldsCoverage: 0.75,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.schemas.set(productSchema.id, productSchema);
    this.schemas.set(articleSchema.id, articleSchema);

    // Example target
    const productTarget: ExtractionTarget = {
      id: "target-product-001",
      name: "Example Product Page",
      schemaId: productSchema.id,
      sourceUrl: "https://example.com/product",
      sourceType: "html",
      owner: "extraction-team",
      cadence: "daily",
      tags: ["example", "product"],
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.targets.set(productTarget.id, productTarget);
    this.targetRunsIndex.set(productTarget.id, []);
  }

  async saveRun(run: ExtractionRun): Promise<void> {
    this.runs.set(run.id, JSON.parse(JSON.stringify(run)));
    
    // Update index
    const targetRunIds = this.targetRunsIndex.get(run.targetId) || [];
    targetRunIds.unshift(run.id); // Add to front (newest first)
    this.targetRunsIndex.set(run.targetId, targetRunIds);
  }

  async getRun(runId: string): Promise<ExtractionRun | null> {
    const run = this.runs.get(runId);
    return run ? JSON.parse(JSON.stringify(run)) : null;
  }

  async getPriorRun(targetId: string, beforeRunId?: string): Promise<ExtractionRun | null> {
    const runIds = this.targetRunsIndex.get(targetId) || [];
    
    for (const runId of runIds) {
      if (beforeRunId && runId === beforeRunId) break;
      const run = this.runs.get(runId);
      if (run && run.status === "completed") {
        return JSON.parse(JSON.stringify(run));
      }
    }
    return null;
  }

  async listRuns(targetId?: string, limit: number = 10): Promise<ExtractionRun[]> {
    let runs: ExtractionRun[];
    
    if (targetId) {
      const runIds = this.targetRunsIndex.get(targetId) || [];
      runs = runIds.map(id => this.runs.get(id)).filter((r): r is ExtractionRun => r !== undefined);
    } else {
      runs = Array.from(this.runs.values());
    }
    
    return runs
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit)
      .map(run => JSON.parse(JSON.stringify(run)));
  }

  async listTargets(): Promise<ExtractionTarget[]> {
    return Array.from(this.targets.values())
      .map(t => JSON.parse(JSON.stringify(t)));
  }

  async getTarget(targetId: string): Promise<ExtractionTarget | null> {
    const target = this.targets.get(targetId);
    return target ? JSON.parse(JSON.stringify(target)) : null;
  }

  async saveTarget(target: ExtractionTarget): Promise<void> {
    this.targets.set(target.id, JSON.parse(JSON.stringify(target)));
    if (!this.targetRunsIndex.has(target.id)) {
      this.targetRunsIndex.set(target.id, []);
    }
  }

  async listSchemas(): Promise<ExtractionSchema[]> {
    return Array.from(this.schemas.values())
      .map(s => JSON.parse(JSON.stringify(s)));
  }

  async getSchema(schemaId: string): Promise<ExtractionSchema | null> {
    const schema = this.schemas.get(schemaId);
    return schema ? JSON.parse(JSON.stringify(schema)) : null;
  }

  async saveSchema(schema: ExtractionSchema): Promise<void> {
    this.schemas.set(schema.id, JSON.parse(JSON.stringify(schema)));
  }

  // Helper to generate new IDs
  generateRunId(): string {
    return `run_${Date.now()}_${++this.runIdCounter}`;
  }

  generateTargetId(): string {
    return `target_${Date.now()}_${++this.targetIdCounter}`;
  }

  generateSchemaId(): string {
    return `schema_${Date.now()}_${++this.schemaIdCounter}`;
  }
}

// Singleton instance
export const evidenceStore = new InMemoryExtractionEvidenceStore();
