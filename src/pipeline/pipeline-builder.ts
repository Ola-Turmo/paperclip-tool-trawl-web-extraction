import { z } from 'zod';

/**
 * Pipeline step types
 */
export const PipelineStepTypeSchema = z.enum(['extract', 'transform', 'route', 'output']);
export type PipelineStepType = z.infer<typeof PipelineStepTypeSchema>;

/**
 * Configuration for a pipeline step
 */
export const PipelineStepConfigSchema = z.object({
  // For extract steps
  extractionMethod: z.enum(['llm', 'vision', 'table', 'regex']).optional(),
  schema: z.instanceof(z.ZodType).optional(),
  // For transform steps
  transformType: z.enum(['map', 'filter', 'flatten', 'merge', 'rename', 'cast', 'template']).optional(),
  transformConfig: z.record(z.unknown()).optional(),
  // Common transform fields (can also be in transformConfig)
  field: z.string().optional(),
  template: z.string().optional(),
  defaultValue: z.unknown().optional(),
  // For route steps
  routeCondition: z.string().optional(),
  routeOnField: z.string().optional(),
  // For output steps
  outputFormat: z.enum(['json', 'csv', 'xml', 'html']).optional(),
  outputPath: z.string().optional(),
  // Common options
  timeout: z.number().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  continueOnError: z.boolean().default(false),
});
export type PipelineStepConfig = z.infer<typeof PipelineStepConfigSchema>;

/**
 * A single step in a pipeline
 */
export interface PipelineStep {
  id: string;
  type: PipelineStepType;
  config: PipelineStepConfig;
  nextSteps: string[];
}

/**
 * Schema for validating pipeline step input
 */
export const PipelineStepSchema = z.object({
  id: z.string().min(1),
  type: PipelineStepTypeSchema,
  config: PipelineStepConfigSchema,
  nextSteps: z.array(z.string()).default([]),
});
export type PipelineStepInput = z.infer<typeof PipelineStepSchema>;

/**
 * A complete extraction pipeline
 */
export interface Pipeline {
  id: string;
  name: string;
  steps: PipelineStep[];
  createdAt: string;
  updatedAt: string;
}

const pipelines = new Map<string, Pipeline>();

function generateId(): string {
  return `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function validateStepReference(pipeline: Pipeline, stepId: string): boolean {
  return pipeline.steps.some(s => s.id === stepId);
}

function hasCycle(pipeline: Pipeline, fromStepId: string, toStepId: string): boolean {
  const visited = new Set<string>();
  const stack = [toStepId];
  
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromStepId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    
    const step = pipeline.steps.find(s => s.id === current);
    if (step) {
      stack.push(...step.nextSteps);
    }
  }
  return false;
}

/**
 * PipelineBuilder class for creating and managing extraction pipelines
 */
export class PipelineBuilder {
  /**
   * Create a new pipeline with the given name
   */
  createPipeline(name: string): Pipeline {
    const id = generateId();
    const now = new Date().toISOString();
    const pipeline: Pipeline = {
      id,
      name,
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
    pipelines.set(id, pipeline);
    return pipeline;
  }

  /**
   * Add a step to an existing pipeline
   */
  addStep(pipelineId: string, stepInput: PipelineStepInput): Pipeline {
    const pipeline = pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline with id "${pipelineId}" not found`);
    }

    // Validate the step
    const parsed = PipelineStepSchema.safeParse(stepInput);
    if (!parsed.success) {
      throw new Error(`Invalid step configuration: ${parsed.error.message}`);
    }

    // Check for duplicate step id
    if (pipeline.steps.some(s => s.id === stepInput.id)) {
      throw new Error(`Step with id "${stepInput.id}" already exists in pipeline`);
    }

    const step: PipelineStep = {
      id: stepInput.id,
      type: stepInput.type,
      config: stepInput.config,
      nextSteps: stepInput.nextSteps || [],
    };

    pipeline.steps.push(step);
    pipeline.updatedAt = new Date().toISOString();
    return pipeline;
  }

  /**
   * Remove a step from a pipeline
   */
  removeStep(pipelineId: string, stepId: string): Pipeline {
    const pipeline = pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline with id "${pipelineId}" not found`);
    }

    const stepIndex = pipeline.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step with id "${stepId}" not found in pipeline`);
    }

    // Remove the step
    pipeline.steps.splice(stepIndex, 1);

    // Remove references to this step from other steps' nextSteps
    for (const step of pipeline.steps) {
      step.nextSteps = step.nextSteps.filter(id => id !== stepId);
    }

    pipeline.updatedAt = new Date().toISOString();
    return pipeline;
  }

  /**
   * Connect two steps in the pipeline (add fromStep's nextSteps to include toStep)
   */
  connectSteps(pipelineId: string, fromStepId: string, toStepId: string): Pipeline {
    const pipeline = pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline with id "${pipelineId}" not found`);
    }

    const fromStep = pipeline.steps.find(s => s.id === fromStepId);
    const toStep = pipeline.steps.find(s => s.id === toStepId);

    if (!fromStep) {
      throw new Error(`Step with id "${fromStepId}" not found`);
    }
    if (!toStep) {
      throw new Error(`Step with id "${toStepId}" not found`);
    }

    // Check for cycles
    if (hasCycle(pipeline, fromStepId, toStepId)) {
      throw new Error(`Connecting ${fromStepId} to ${toStepId} would create a cycle`);
    }

    // Add toStep to fromStep's nextSteps if not already present
    if (!fromStep.nextSteps.includes(toStepId)) {
      fromStep.nextSteps.push(toStepId);
      pipeline.updatedAt = new Date().toISOString();
    }

    return pipeline;
  }

  /**
   * Disconnect two steps in the pipeline
   */
  disconnectSteps(pipelineId: string, fromStepId: string, toStepId: string): Pipeline {
    const pipeline = pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline with id "${pipelineId}" not found`);
    }

    const fromStep = pipeline.steps.find(s => s.id === fromStepId);
    if (!fromStep) {
      throw new Error(`Step with id "${fromStepId}" not found`);
    }

    fromStep.nextSteps = fromStep.nextSteps.filter(id => id !== toStepId);
    pipeline.updatedAt = new Date().toISOString();
    return pipeline;
  }

  /**
   * Validate a pipeline's structure
   */
  validatePipeline(pipelineId: string): { valid: boolean; errors: string[] } {
    const pipeline = pipelines.get(pipelineId);
    const errors: string[] = [];

    if (!pipeline) {
      return { valid: false, errors: [`Pipeline with id "${pipelineId}" not found`] };
    }

    if (pipeline.steps.length === 0) {
      errors.push('Pipeline has no steps');
    }

    // Check for orphan steps (not reachable from any other step)
    const connectedSteps = new Set<string>();
    for (const step of pipeline.steps) {
      for (const nextId of step.nextSteps) {
        if (!validateStepReference(pipeline, nextId)) {
          errors.push(`Step "${step.id}" references non-existent step "${nextId}"`);
        }
        connectedSteps.add(nextId);
      }
    }

    // Find entry points (steps not referenced by any other step's nextSteps)
    const entryPoints = pipeline.steps.filter(s => !connectedSteps.has(s.id));
    if (pipeline.steps.length > 0 && entryPoints.length === 0) {
      errors.push('Pipeline has no entry point (all steps are referenced by other steps)');
    }

    // Check for cycles
    for (const step of pipeline.steps) {
      if (hasCycle(pipeline, step.id, step.id)) {
        errors.push(`Step "${step.id}" has a self-referencing cycle`);
      }
    }

    // Validate step configurations
    for (const step of pipeline.steps) {
      if (step.type === 'extract' && !step.config.extractionMethod) {
        errors.push(`Extract step "${step.id}" missing extractionMethod config`);
      }
      if (step.type === 'transform' && !step.config.transformType) {
        errors.push(`Transform step "${step.id}" missing transformType config`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get a pipeline by ID
   */
  getPipeline(id: string): Pipeline | undefined {
    return pipelines.get(id);
  }

  /**
   * List all pipelines
   */
  listPipelines(): Pipeline[] {
    return Array.from(pipelines.values());
  }

  /**
   * Delete a pipeline
   */
  deletePipeline(id: string): boolean {
    return pipelines.delete(id);
  }

  /**
   * Update a pipeline's metadata
   */
  updatePipeline(id: string, updates: { name?: string }): Pipeline {
    const pipeline = pipelines.get(id);
    if (!pipeline) {
      throw new Error(`Pipeline with id "${id}" not found`);
    }
    if (updates.name) {
      pipeline.name = updates.name;
    }
    pipeline.updatedAt = new Date().toISOString();
    return pipeline;
  }
}

// Export singleton instance
export const pipelineBuilder = new PipelineBuilder();
