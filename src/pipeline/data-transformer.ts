import { z } from 'zod';

/**
 * Types of data transformations available
 */
export const TransformerTypeSchema = z.enum(['map', 'filter', 'flatten', 'merge', 'rename', 'cast', 'template']);
export type TransformerType = z.infer<typeof TransformerTypeSchema>;

/**
 * Configuration for a data transformation
 */
export const TransformConfigSchema = z.object({
  type: TransformerTypeSchema,
  /** Field to apply transformation on (for field-specific transforms) */
  field: z.string().optional(),
  /** Mapping for rename/merge transforms */
  mapping: z.record(z.unknown()).optional(),
  /** Template string for template transforms (e.g., "Hello {name}") */
  template: z.string().optional(),
  /** Default value for missing fields */
  defaultValue: z.unknown().optional(),
  /** Whether to deep clone data before transforming */
  deepClone: z.boolean().optional().default(true),
});
export type TransformConfig = z.infer<typeof TransformConfigSchema>;

/**
 * Result of a transformation operation
 */
export interface TransformResult {
  data: unknown;
  errors: string[];
  warnings: string[];
}

/**
 * DataTransformer class for transforming extracted data
 */
export class DataTransformer {
  /**
   * Apply a transformation to data
   */
  static transform(data: unknown, config: TransformConfig): TransformResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const result = this.applyTransform(data, config, errors, warnings);
      return { data: result, errors, warnings };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown transformation error';
      errors.push(message);
      return { data, errors, warnings };
    }
  }

  /**
   * Apply a single transformation
   */
  private static applyTransform(
    data: unknown,
    config: TransformConfig,
    errors: string[],
    warnings: string[]
  ): unknown {
    switch (config.type) {
      case 'map':
        return this.applyMap(data, config, errors, warnings);
      case 'filter':
        return this.applyFilter(data, config, errors, warnings);
      case 'flatten':
        return this.applyFlatten(data, config, errors, warnings);
      case 'merge':
        return this.applyMerge(data, config, errors, warnings);
      case 'rename':
        return this.applyRename(data, config, errors, warnings);
      case 'cast':
        return this.applyCast(data, config, errors, warnings);
      case 'template':
        return this.applyTemplate(data, config, errors, warnings);
      default:
        errors.push(`Unknown transform type: ${config.type}`);
        return data;
    }
  }

  /**
   * Apply a map transformation - transform values using a mapping function
   */
  private static applyMap(
    data: unknown,
    config: TransformConfig,
    errors: string[],
    _warnings: string[]
  ): unknown {
    if (typeof data !== 'object' || data === null) {
      errors.push('Map transformation requires an object or array');
      return data;
    }

    const mapping = config.mapping || {};
    const result = Array.isArray(data) ? [...data] : { ...(data as Record<string, unknown>) };

    if (Array.isArray(result)) {
      return result.map((item, index) => {
        if (typeof item === 'object' && item !== null) {
          const mapped: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
            mapped[key] = key in mapping ? mapping[key] : value;
          }
          return mapped;
        }
        return item;
      });
    }

    for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
      if (key in mapping) {
        (result as Record<string, unknown>)[key] = mapping[key];
      }
    }

    return result;
  }

  /**
   * Apply a filter transformation - filter object/array entries
   */
  private static applyFilter(
    data: unknown,
    config: TransformConfig,
    errors: string[],
    _warnings: string[]
  ): unknown {
    if (Array.isArray(data)) {
      const field = config.field;
      if (!field) {
        errors.push('Filter transformation on array requires a field name');
        return data;
      }

      return data.filter((item) => {
        if (typeof item !== 'object' || item === null) return true;
        const value = (item as Record<string, unknown>)[field];
        return value !== null && value !== undefined;
      });
    }

    if (typeof data === 'object' && data !== null) {
      const fieldsToKeep = config.field ? config.field.split(',').map(f => f.trim()) : [];
      const result: Record<string, unknown> = {};
      
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (fieldsToKeep.length === 0 || fieldsToKeep.includes(key)) {
          result[key] = value;
        }
      }
      return result;
    }

    errors.push('Filter transformation requires an object or array');
    return data;
  }

  /**
   * Apply a flatten transformation - flatten nested structures
   */
  private static applyFlatten(
    data: unknown,
    config: TransformConfig,
    errors: string[],
    _warnings: string[]
  ): unknown {
    if (typeof data !== 'object' || data === null) {
      errors.push('Flatten transformation requires an object or array');
      return data;
    }

    const separator = (config.mapping?.['separator'] as string) || '.';
    const maxDepth = (config.mapping?.['maxDepth'] as number) || 10;

    const flattenObject = (obj: Record<string, unknown>, depth = 0, parentKey = ''): Record<string, unknown> => {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        const newKey = parentKey ? `${parentKey}${separator}${key}` : key;

        if (depth >= maxDepth) {
          result[newKey] = value;
          continue;
        }

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          Object.assign(result, flattenObject(value as Record<string, unknown>, depth + 1, newKey));
        } else if (Array.isArray(value)) {
          // Flatten arrays by indexing: items.0, items.1, etc.
          value.forEach((item, index) => {
            if (typeof item === 'object' && item !== null) {
              Object.assign(result, flattenObject(item as Record<string, unknown>, depth + 1, `${newKey}${separator}${index}`));
            } else {
              result[`${newKey}${separator}${index}`] = item;
            }
          });
        } else {
          result[newKey] = value;
        }
      }

      return result;
    };

    if (Array.isArray(data)) {
      const result: unknown[] = [];
      for (const item of data) {
        if (typeof item === 'object' && item !== null) {
          result.push(flattenObject(item as Record<string, unknown>));
        } else {
          result.push(item);
        }
      }
      return result;
    }

    return flattenObject(data as Record<string, unknown>);
  }

  /**
   * Apply a merge transformation - merge multiple objects or combine data
   */
  private static applyMerge(
    data: unknown,
    config: TransformConfig,
    errors: string[],
    _warnings: string[]
  ): unknown {
    const sources = config.mapping?.['sources'] as unknown[] || [];
    
    if (!Array.isArray(data) && typeof data !== 'object') {
      errors.push('Merge transformation requires an object or array');
      return data;
    }

    const result: Record<string, unknown> = {};

    // Merge the primary data
    if (typeof data === 'object' && data !== null) {
      Object.assign(result, data as Record<string, unknown>);
    }

    // Merge additional sources
    for (const source of sources) {
      if (typeof source === 'object' && source !== null) {
        Object.assign(result, source as Record<string, unknown>);
      }
    }

    // Handle array merge
    if (Array.isArray(data)) {
      const merged: unknown[] = [...data];
      for (const source of sources) {
        if (Array.isArray(source)) {
          merged.push(...source);
        }
      }
      return merged.length > 0 ? merged : result;
    }

    return result;
  }

  /**
   * Apply a rename transformation - rename object keys
   */
  private static applyRename(
    data: unknown,
    config: TransformConfig,
    errors: string[],
    _warnings: string[]
  ): unknown {
    const mapping = config.mapping || {};
    
    if (typeof data !== 'object' || data === null) {
      errors.push('Rename transformation requires an object or array');
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => {
        if (typeof item !== 'object' || item === null) return item;
        return this.applyRenameToObject(item as Record<string, unknown>, mapping);
      });
    }

    return this.applyRenameToObject(data as Record<string, unknown>, mapping);
  }

  private static applyRenameToObject(
    obj: Record<string, unknown>,
    mapping: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = (key in mapping) ? String(mapping[key]) : key;
      result[newKey] = value;
    }

    return result;
  }

  /**
   * Apply a cast transformation - convert field types
   */
  private static applyCast(
    data: unknown,
    config: TransformConfig,
    errors: string[],
    warnings: string[]
  ): unknown {
    const field = config.field;
    const targetType = config.mapping?.['to'] as string || 'string';
    const defaultValue = config.defaultValue;

    if (!field) {
      errors.push('Cast transformation requires a field name');
      return data;
    }

    if (typeof data !== 'object' || data === null) {
      errors.push('Cast transformation requires an object');
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => {
        if (typeof item !== 'object' || item === null) return item;
        return this.applyCastToObject(item as Record<string, unknown>, field, targetType, defaultValue, warnings);
      });
    }

    return this.applyCastToObject(data as Record<string, unknown>, field, targetType, defaultValue, warnings);
  }

  private static applyCastToObject(
    obj: Record<string, unknown>,
    field: string,
    targetType: string,
    defaultValue: unknown,
    warnings: string[]
  ): Record<string, unknown> {
    const result = { ...obj };
    const value = result[field];

    try {
      result[field] = this.castValue(value, targetType, defaultValue);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown cast error';
      warnings.push(`Failed to cast field "${field}": ${message}`);
    }

    return result;
  }

  private static castValue(value: unknown, targetType: string, defaultValue: unknown): unknown {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    switch (targetType) {
      case 'string':
        return String(value);
      case 'number':
        const num = Number(value);
        if (isNaN(num)) throw new Error(`Cannot cast "${value}" to number`);
        return num;
      case 'boolean':
        if (value === 'true' || value === '1' || value === 'yes') return true;
        if (value === 'false' || value === '0' || value === 'no') return false;
        return Boolean(value);
      case 'date':
      case 'datetime':
        const date = new Date(value as string | number);
        if (isNaN(date.getTime())) throw new Error(`Cannot cast "${value}" to date`);
        return date.toISOString();
      case 'array':
        return Array.isArray(value) ? value : [value];
      case 'object':
        return typeof value === 'object' ? value : { value };
      default:
        throw new Error(`Unknown target type: ${targetType}`);
    }
  }

  /**
   * Apply a template transformation - format strings using templates
   */
  private static applyTemplate(
    data: unknown,
    config: TransformConfig,
    errors: string[],
    _warnings: string[]
  ): unknown {
    const template = config.template;
    
    if (!template) {
      errors.push('Template transformation requires a template string');
      return data;
    }

    if (typeof data === 'string') {
      return template.replace(/\{(\d+)\}/g, (_, index) => {
        // Support positional placeholders like {0}, {1}
        return data;
      });
    }

    if (typeof data === 'object' && data !== null) {
      return template.replace(/\{(\w+)\}/g, (match, key) => {
        const value = (data as Record<string, unknown>)[key];
        return value !== undefined ? String(value) : match;
      });
    }

    errors.push('Template transformation requires an object or string');
    return data;
  }

  /**
   * Apply multiple transformations in sequence
   */
  static transformMany(data: unknown, configs: TransformConfig[]): TransformResult {
    let currentData = data;
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    for (const config of configs) {
      const result = this.transform(currentData, config);
      currentData = result.data;
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    return { data: currentData, errors: allErrors, warnings: allWarnings };
  }
}
