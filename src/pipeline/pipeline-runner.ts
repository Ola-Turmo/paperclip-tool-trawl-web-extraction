import { Pipeline, PipelineStep } from './pipeline-builder.js';
import { DataTransformer, TransformConfig } from './data-transformer.js';
import { scoreConfidence } from '../confidence-scorer.js';

/**
 * Result of executing a single pipeline step
 */
export interface StepResult {
  stepId: string;
  stepType: PipelineStep['type'];
  input: unknown;
  output: unknown;
  confidence: number;
  errors: string[];
  durationMs: number;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Result of a complete pipeline execution
 */
export interface PipelineExecutionResult {
  pipelineId: string;
  pipelineName: string;
  stepResults: StepResult[];
  finalData: unknown;
  executionTime: number;
  errors: string[];
  status: 'completed' | 'partial' | 'failed';
}

/**
 * Options for pipeline execution
 */
export interface PipelineExecutorOptions {
  /** Maximum time per step in milliseconds */
  timeout?: number;
  /** Maximum retries for failed steps */
  maxRetries?: number;
  /** Initial context passed to the pipeline */
  initialContext?: Record<string, unknown>;
  /** Confidence threshold for step success */
  confidenceThreshold?: number;
}

/**
 * Default execution options
 */
const DEFAULT_OPTIONS: Required<PipelineExecutorOptions> = {
  timeout: 60000,
  maxRetries: 3,
  initialContext: {},
  confidenceThreshold: 0.5,
};

/**
 * PipelineExecutor class for running extraction pipelines
 */
export class PipelineExecutor {
  private extractor: Function;
  private options: Required<PipelineExecutorOptions>;

  /**
   * Create a new PipelineExecutor
   * @param extractor - Function to use for extraction steps (receives config with url and schema)
   * @param options - Execution options
   */
  constructor(extractor: Function, options: PipelineExecutorOptions = {}) {
    this.extractor = extractor;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a pipeline with the given input
   */
  async execute(
    pipeline: Pipeline,
    input: { url: string; initialData?: Record<string, unknown> }
  ): Promise<PipelineExecutionResult> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    const errors: string[] = [];
    
    // Initialize context with input data
    let context: Record<string, unknown> = {
      url: input.url,
      ...this.options.initialContext,
      ...input.initialData,
    };

    // Find entry point steps (steps not referenced by any other step)
    const entrySteps = this.findEntrySteps(pipeline);

    if (entrySteps.length === 0 && pipeline.steps.length > 0) {
      return {
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        stepResults: [],
        finalData: null,
        executionTime: Date.now() - startTime,
        errors: ['No entry point found in pipeline'],
        status: 'failed',
      };
    }

    // Execute from entry points
    for (const entryStep of entrySteps) {
      const result = await this.executeStep(pipeline, entryStep, context);
      stepResults.push(result);
      
      if (result.output) {
        context = { ...context, ...(result.output as Record<string, unknown>) };
      }
      
      if (result.errors.length > 0) {
        errors.push(...result.errors.map(e => `Step ${entryStep.id}: ${e}`));
      }

      // For non-linear pipelines, we would need to handle branching here
      // For now, we follow the first available path
      if (entryStep.nextSteps.length > 0) {
        for (const nextStepId of entryStep.nextSteps) {
          const nextStep = pipeline.steps.find(s => s.id === nextStepId);
          if (nextStep) {
            const nextResult = await this.executeStepRecursive(pipeline, nextStep, context);
            stepResults.push(...nextResult.stepResults);
            errors.push(...nextResult.errors);
            if (nextResult.finalContext) {
              context = { ...context, ...nextResult.finalContext };
            }
          }
        }
      }
    }

    const executionTime = Date.now() - startTime;
    const finalData = this.aggregateResults(stepResults);

    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      stepResults,
      finalData,
      executionTime,
      errors,
      status: this.determineStatus(stepResults, errors),
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    pipeline: Pipeline,
    step: PipelineStep,
    context: Record<string, unknown>
  ): Promise<StepResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let output: unknown = null;
    let confidence = 0;
    let skipped = false;
    let skipReason: string | undefined;

    let stepErrors: string[] = [];

    try {
      switch (step.type) {
        case 'extract': {
          const extractResult = await this.executeExtractStep(step, context);
          output = extractResult.output;
          confidence = extractResult.confidence;
          stepErrors = extractResult.errors;
          break;
        }
        case 'transform': {
          const transformResult = this.executeTransformStep(step, context);
          output = transformResult.output;
          stepErrors = transformResult.errors;
          confidence = 1.0; // Transforms don't typically affect confidence
          break;
        }
        case 'route': {
          const routeResult = this.executeRouteStep(step, context);
          output = routeResult.output;
          skipped = routeResult.skipped;
          skipReason = routeResult.skipReason;
          confidence = 1.0;
          break;
        }
        case 'output':
          // Output steps don't modify data, just signal completion
          output = context;
          confidence = 1.0;
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      stepErrors.push(message);
      
      if (!step.config.continueOnError) {
        return {
          stepId: step.id,
          stepType: step.type,
          input: context,
          output: null,
          confidence: 0,
          errors,
          durationMs: Date.now() - startTime,
          skipped: false,
        };
      }
    }

    return {
      stepId: step.id,
      stepType: step.type,
      input: context,
      output,
      confidence,
      errors,
      durationMs: Date.now() - startTime,
      skipped,
      skipReason,
    };
  }

  /**
   * Execute an extraction step
   */
  private async executeExtractStep(
    step: PipelineStep,
    context: Record<string, unknown>
  ): Promise<{ output: unknown; confidence: number; errors: string[] }> {
    const errors: string[] = [];
    const method = step.config.extractionMethod || 'llm';
    const schema = step.config.schema;

    const extractionConfig = {
      url: context.url as string,
      schema,
      options: {
        method,
        confidenceThreshold: this.options.confidenceThreshold,
        timeout: step.config.timeout || this.options.timeout,
        maxRetries: step.config.maxRetries || this.options.maxRetries,
      },
    };

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < (step.config.maxRetries || this.options.maxRetries)) {
      try {
        const result = await this.executeWithTimeout(
          this.extractor,
          [extractionConfig],
          step.config.timeout || this.options.timeout
        ) as { data: unknown; errors?: string[] };

        // Calculate confidence based on extraction result
        const confidenceFactors = {
          methodReliability: this.getMethodReliability(method),
          dataCompleteness: this.calculateCompleteness(result.data, schema),
          schemaAlignment: 0.8, // Default assumption
        };

        const confidenceScore = scoreConfidence(confidenceFactors);

        return {
          output: result.data,
          confidence: confidenceScore.score,
          errors: result.errors || [],
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Extraction failed');
        attempt++;
        
        if (attempt < (step.config.maxRetries || this.options.maxRetries)) {
          // Wait before retry
          await this.delay(Math.pow(2, attempt) * 100);
        }
      }
    }

    errors.push(`Extraction failed after ${attempt} attempts: ${lastError?.message}`);
    return { output: null, confidence: 0, errors };
  }

  /**
   * Execute a transform step
   */
  private executeTransformStep(
    step: PipelineStep,
    context: Record<string, unknown>
  ): { output: unknown; errors: string[] } {
    const errors: string[] = [];
    const transformType = step.config.transformType;
    const transformConfig: TransformConfig = {
      type: transformType || 'map',
      field: step.config.field,
      mapping: step.config.transformConfig as Record<string, unknown>,
      template: step.config.template,
      defaultValue: step.config.defaultValue,
      deepClone: true,
    };

    // Get data to transform
    const field = step.config.field;
    const dataToTransform = field ? context[field] : context;

    const result = DataTransformer.transform(dataToTransform, transformConfig);

    if (result.errors.length > 0) {
      errors.push(...result.errors);
    }

    // Update context with transformed data
    const output = field
      ? { ...context, [field]: result.data }
      : { ...context, ...(result.data as Record<string, unknown>) };

    return { output, errors };
  }

  /**
   * Execute a route step
   */
  private executeRouteStep(
    step: PipelineStep,
    context: Record<string, unknown>
  ): { output: unknown; skipped: boolean; skipReason?: string } {
    const routeField = step.config.routeOnField;
    const routeCondition = step.config.routeCondition;

    if (!routeField) {
      return {
        output: context,
        skipped: false,
        skipReason: undefined,
      };
    }

    const fieldValue = context[routeField];

    // Simple condition evaluation
    if (routeCondition) {
      const [operator, expectedValue] = this.parseCondition(routeCondition);
      const matches = this.evaluateCondition(fieldValue, operator, expectedValue);

      if (!matches) {
        return {
          output: context,
          skipped: true,
          skipReason: `Route condition not met: ${routeField} ${operator} ${expectedValue}`,
        };
      }
    }

    // Check if field value is null/undefined
    if (fieldValue === null || fieldValue === undefined) {
      return {
        output: context,
        skipped: true,
        skipReason: `Route field "${routeField}" is null or undefined`,
      };
    }

    return {
      output: context,
      skipped: false,
    };
  }

  private parseCondition(condition: string): [string, unknown] {
    const match = condition.match(/^(==|!=|>=|<=|>|<|contains)\s*(.+)$/);
    if (!match) return ['==', condition];
    return [match[1], match[2]];
  }

  private evaluateCondition(value: unknown, operator: string, expected: unknown): boolean {
    const strValue = String(value);
    const strExpected = String(expected);

    switch (operator) {
      case '==':
        return value === expected || strValue === strExpected;
      case '!=':
        return value !== expected && strValue !== strExpected;
      case '>':
        return Number(value) > Number(expected);
      case '<':
        return Number(value) < Number(expected);
      case '>=':
        return Number(value) >= Number(expected);
      case '<=':
        return Number(value) <= Number(expected);
      case 'contains':
        return strValue.includes(strExpected);
      default:
        return false;
    }
  }

  /**
   * Recursively execute subsequent steps in the pipeline
   */
  private async executeStepRecursive(
    pipeline: Pipeline,
    step: PipelineStep,
    context: Record<string, unknown>
  ): Promise<{ stepResults: StepResult[]; errors: string[]; finalContext?: Record<string, unknown> }> {
    const stepResults: StepResult[] = [];
    const errors: string[] = [];
    let currentContext = context;

    const result = await this.executeStep(pipeline, step, currentContext);
    stepResults.push(result);

    if (result.output) {
      currentContext = { ...currentContext, ...(result.output as Record<string, unknown>) };
    }

    errors.push(...result.errors);

    // Follow next steps
    for (const nextStepId of step.nextSteps) {
      const nextStep = pipeline.steps.find(s => s.id === nextStepId);
      if (nextStep) {
        const nextResult = await this.executeStepRecursive(pipeline, nextStep, currentContext);
        stepResults.push(...nextResult.stepResults);
        errors.push(...nextResult.errors);
        if (nextResult.finalContext) {
          currentContext = nextResult.finalContext;
        }
      }
    }

    return { stepResults, errors, finalContext: currentContext };
  }

  /**
   * Find entry point steps (not referenced by any other step)
   */
  private findEntrySteps(pipeline: Pipeline): PipelineStep[] {
    const referencedSteps = new Set<string>();
    for (const step of pipeline.steps) {
      for (const nextId of step.nextSteps) {
        referencedSteps.add(nextId);
      }
    }

    return pipeline.steps.filter(step => !referencedSteps.has(step.id));
  }

  /**
   * Aggregate results from all steps
   */
  private aggregateResults(stepResults: StepResult[]): unknown {
    const successfulResults = stepResults.filter(r => !r.skipped && r.errors.length === 0);
    
    if (successfulResults.length === 0) {
      return null;
    }

    // Get the last successful result
    const lastResult = successfulResults[successfulResults.length - 1];
    return lastResult?.output || null;
  }

  /**
   * Determine execution status based on results
   */
  private determineStatus(stepResults: StepResult[], errors: string[]): 'completed' | 'partial' | 'failed' {
    if (stepResults.length === 0) return 'failed';
    
    const hasFailures = stepResults.some(r => r.errors.length > 0 && !r.skipped);
    const hasSkips = stepResults.some(r => r.skipped);
    const allSkipped = stepResults.every(r => r.skipped);

    if (errors.length === 0 && !hasSkips) return 'completed';
    if (allSkipped || (hasFailures && !hasSkips)) return 'failed';
    return 'partial';
  }

  /**
   * Get reliability score for an extraction method
   */
  private getMethodReliability(method: string): number {
    const reliability: Record<string, number> = {
      vision: 0.95,
      llm: 0.85,
      table: 0.80,
      regex: 0.60,
    };
    return reliability[method] ?? 0.5;
  }

  /**
   * Calculate data completeness score
   */
  private calculateCompleteness(data: unknown, schema: unknown): number {
    if (!data || typeof data !== 'object') return 0;
    if (!schema) return 0.7; // Default assumption

    // Try to extract schema fields using Zod's shape
    let schemaFields: string[] = [];
    if (schema && typeof schema === 'object' && 'shape' in schema) {
      const s = schema as Record<string, unknown>;
      const shape = s['shape'];
      if (typeof shape === 'function') {
        const shapeObj = (shape as () => Record<string, unknown>)();
        schemaFields = Object.keys(shapeObj);
      }
    }

    if (schemaFields.length === 0) return 0.7;

    const dataObj = data as Record<string, unknown>;
    const populatedCount = schemaFields.filter(f => 
      dataObj[f] !== null && dataObj[f] !== undefined
    ).length;

    return populatedCount / schemaFields.length;
  }

  /**
   * Execute a function with a timeout
   */
  private async executeWithTimeout<T>(fn: Function, args: unknown[], timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeout}ms`));
      }, timeout);

      fn(...args)
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
