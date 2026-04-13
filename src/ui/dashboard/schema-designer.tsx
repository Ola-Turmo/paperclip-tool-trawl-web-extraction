import React, { useState, useCallback } from 'react';
import { z, ZodType, ZodError, ZodIssue } from 'zod';
import {
  ExtractionMethod,
  ExtractionMethodSchema,
  SchemaValidationResult,
  SchemaValidationResultSchema,
} from '../../extraction-schema.js';

// ============================================
// Type Definitions
// ============================================

/** Supported Zod type builders */
export type ZodTypeName =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'array'
  | 'object'
  | 'optional'
  | 'nullable'
  | 'union';

/** Configuration for a single schema field */
export interface FieldConfig {
  name: string;
  type: ZodTypeName;
  required: boolean;
  description?: string;
  children?: FieldConfig[]; // For object/array types
  enumValues?: string[]; // For enum types
  schema?: ZodType; // The constructed Zod schema
}

/** Schema design definition */
export interface SchemaDesign {
  id: string;
  name: string;
  description: string;
  method: ExtractionMethod;
  fields: FieldConfig[];
  rawSchema?: string; // Serialized schema representation
}

/** Result of testing a schema against sample data */
export interface SchemaTestResult {
  success: boolean;
  data?: unknown;
  error?: string;
  issues?: ZodIssue[];
}

/** Serialized schema for persistence */
export interface SerializedSchema {
  id: string;
  name: string;
  description: string;
  method: ExtractionMethod;
  fields: FieldConfig[];
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Schema Builder Functions
// ============================================

/**
 * Build a Zod schema from field configurations
 */
function buildZodSchema(fields: FieldConfig[]): z.ZodObject<Record<string, ZodType>> {
  const shape: Record<string, ZodType> = {};

  for (const field of fields) {
    shape[field.name] = buildFieldSchema(field);
  }

  return z.object(shape);
}

/**
 * Build a Zod type from a single field configuration
 */
function buildFieldSchema(field: FieldConfig): ZodType {
  let schema: ZodType;

  switch (field.type) {
    case 'string':
      schema = z.string();
      break;
    case 'number':
      schema = z.number();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'date':
      schema = z.string().datetime();
      break;
    case 'enum':
      if (field.enumValues && field.enumValues.length > 0) {
        schema = z.enum(field.enumValues as [string, ...string[]]);
      } else {
        schema = z.string();
      }
      break;
    case 'array':
      if (field.children && field.children.length > 0) {
        const itemSchema = buildZodSchema(field.children);
        schema = z.array(itemSchema);
      } else {
        schema = z.array(z.string());
      }
      break;
    case 'object':
      if (field.children && field.children.length > 0) {
        schema = buildZodSchema(field.children);
      } else {
        schema = z.object({});
      }
      break;
    case 'optional':
      schema = z.string().optional();
      break;
    case 'nullable':
      schema = z.string().nullable();
      break;
    case 'union':
      schema = z.union([z.string(), z.number()]);
      break;
    default:
      schema = z.string();
  }

  if (!field.required) {
    if (field.type === 'optional') {
      return schema;
    }
    return schema.optional();
  }

  return schema;
}

/**
 * Validate sample data against a schema design
 */
function testSchema(
  schemaDesign: SchemaDesign,
  sampleData: unknown
): SchemaTestResult {
  try {
    const schema = buildZodSchema(schemaDesign.fields);
    const result = schema.safeParse(sampleData);

    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    } else {
      return {
        success: false,
        error: formatZodError(result.error),
        issues: result.error.issues,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Validate schema design itself for errors
 */
function validateSchemaDesign(design: SchemaDesign): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for duplicate field names
  const fieldNames = new Set<string>();
  for (const field of design.fields) {
    if (fieldNames.has(field.name)) {
      errors.push(`Duplicate field name: ${field.name}`);
    }
    fieldNames.add(field.name);

    // Validate field names
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name)) {
      errors.push(`Invalid field name: ${field.name}. Must start with letter or underscore.`);
    }
  }

  // Check for empty schema
  if (design.fields.length === 0) {
    warnings.push('Schema has no fields defined');
  }

  // Validate enum fields have values
  for (const field of design.fields) {
    if (field.type === 'enum' && (!field.enumValues || field.enumValues.length === 0)) {
      errors.push(`Enum field "${field.name}" has no enum values`);
    }
  }

  // Validate nested fields
  for (const field of design.fields) {
    if ((field.type === 'object' || field.type === 'array') && field.children) {
      validateNestedFields(field.children, field.name, errors, warnings);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateNestedFields(
  fields: FieldConfig[],
  parentName: string,
  errors: string[],
  warnings: string[]
): void {
  const fieldNames = new Set<string>();
  for (const field of fields) {
    const fullName = `${parentName}.${field.name}`;
    if (fieldNames.has(field.name)) {
      errors.push(`Duplicate nested field name: ${fullName}`);
    }
    fieldNames.add(field.name);

    if ((field.type === 'object' || field.type === 'array') && field.children) {
      validateNestedFields(field.children, fullName, errors, warnings);
    }
  }
}

/**
 * Format Zod error into human-readable string
 */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
      return `${issue.message}${path}`;
    })
    .join('\n');
}

/**
 * Serialize schema design to JSON string
 */
function serializeSchemaDesign(design: SchemaDesign): string {
  return JSON.stringify(
    {
      id: design.id,
      name: design.name,
      description: design.description,
      method: design.method,
      fields: design.fields,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Deserialize schema design from JSON
 */
function deserializeSchemaDesign(json: string): SchemaDesign | null {
  try {
    const data = JSON.parse(json) as SerializedSchema;
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      method: data.method,
      fields: data.fields,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a new unique ID for schema designs
 */
function generateSchemaId(): string {
  return `schema_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an empty schema design
 */
function createEmptySchemaDesign(method: ExtractionMethod = 'llm'): SchemaDesign {
  return {
    id: generateSchemaId(),
    name: 'New Schema',
    description: '',
    method,
    fields: [],
  };
}

/**
 * Get default field configuration
 */
function createDefaultField(type: ZodTypeName = 'string'): FieldConfig {
  return {
    name: '',
    type,
    required: true,
    description: '',
    children: type === 'object' || type === 'array' ? [] : undefined,
    enumValues: type === 'enum' ? [] : undefined,
  };
}

// ============================================
// UI Components
// ============================================

interface FieldEditorProps {
  field: FieldConfig;
  onChange: (field: FieldConfig) => void;
  onRemove: () => void;
  index: number;
}

const FieldTypeOptions: { value: ZodTypeName; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date/DateTime' },
  { value: 'enum', label: 'Enum' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' },
  { value: 'optional', label: 'Optional String' },
  { value: 'nullable', label: 'Nullable' },
  { value: 'union', label: 'Union' },
];

const FieldEditor: React.FC<FieldEditorProps> = ({ field, onChange, onRemove, index }) => {
  const handleChange = useCallback(
    (updates: Partial<FieldConfig>) => {
      onChange({ ...field, ...updates });
    },
    [field, onChange]
  );

  const handleEnumValuesChange = useCallback((value: string) => {
    const values = value
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    onChange({ ...field, enumValues: values });
  }, [field, onChange]);

  return (
    <div className="field-editor" style={styles.fieldEditor}>
      <div style={styles.fieldHeader}>
        <span style={styles.fieldIndex}>Field {index + 1}</span>
        <button onClick={onRemove} style={styles.removeButton}>
          Remove
        </button>
      </div>

      <div style={styles.fieldRow}>
        <label style={styles.label}>
          Name:
          <input
            type="text"
            value={field.name}
            onChange={(e) => handleChange({ name: e.target.value })}
            placeholder="fieldName"
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Type:
          <select
            value={field.type}
            onChange={(e) => handleChange({ type: e.target.value as ZodTypeName })}
            style={styles.select}
          >
            {FieldTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Required:
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => handleChange({ required: e.target.checked })}
            style={styles.checkbox}
          />
        </label>
      </div>

      {field.type === 'enum' && (
        <label style={styles.label}>
          Enum Values (comma-separated):
          <input
            type="text"
            value={field.enumValues?.join(', ') || ''}
            onChange={(e) => handleEnumValuesChange(e.target.value)}
            placeholder="value1, value2, value3"
            style={styles.input}
          />
        </label>
      )}

      <label style={styles.label}>
        Description:
        <input
          type="text"
          value={field.description || ''}
          onChange={(e) => handleChange({ description: e.target.value })}
          placeholder="Field description"
          style={styles.input}
        />
      </label>

      {(field.type === 'object' || field.type === 'array') && (
        <div style={styles.nestedFields}>
          <strong>Nested Fields:</strong>
          {field.children && field.children.length > 0 ? (
            field.children.map((child, childIndex) => (
              <FieldEditor
                key={childIndex}
                field={child}
                index={childIndex}
                onChange={(updatedChild) => {
                  const newChildren = [...(field.children || [])];
                  newChildren[childIndex] = updatedChild;
                  handleChange({ children: newChildren });
                }}
                onRemove={() => {
                  const newChildren = [...(field.children || [])];
                  newChildren.splice(childIndex, 1);
                  handleChange({ children: newChildren });
                }}
              />
            ))
          ) : (
            <p style={styles.noNested}>No nested fields</p>
          )}
          <button
            onClick={() =>
              handleChange({
                children: [...(field.children || []), createDefaultField('string')],
              })
            }
            style={styles.addNestedButton}
          >
            Add Nested Field
          </button>
        </div>
      )}
    </div>
  );
};

interface SchemaDesignerProps {
  initialDesign?: SchemaDesign;
  onSave?: (design: SchemaDesign) => void;
  onExport?: (design: SchemaDesign) => void;
}

const SchemaDesigner: React.FC<SchemaDesignerProps> = ({
  initialDesign,
  onSave,
  onExport,
}) => {
  const [design, setDesign] = useState<SchemaDesign>(
    initialDesign || createEmptySchemaDesign()
  );
  const [sampleData, setSampleData] = useState<string>('');
  const [testResult, setTestResult] = useState<SchemaTestResult | null>(null);
  const [validationResult, setValidationResult] = useState<SchemaValidationResult | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<'builder' | 'test' | 'code'>('builder');

  const updateField = useCallback((index: number, updatedField: FieldConfig) => {
    setDesign((prev) => {
      const newFields = [...prev.fields];
      newFields[index] = updatedField;
      return { ...prev, fields: newFields };
    });
  }, []);

  const removeField = useCallback((index: number) => {
    setDesign((prev) => {
      const newFields = [...prev.fields];
      newFields.splice(index, 1);
      return { ...prev, fields: newFields };
    });
  }, []);

  const addField = useCallback((type: ZodTypeName = 'string') => {
    setDesign((prev) => ({
      ...prev,
      fields: [...prev.fields, createDefaultField(type)],
    }));
  }, []);

  const handleMethodChange = useCallback((method: ExtractionMethod) => {
    setDesign((prev) => ({ ...prev, method }));
  }, []);

  const handleValidate = useCallback(() => {
    const result = validateSchemaDesign(design);
    setValidationResult(result);
  }, [design]);

  const handleTest = useCallback(() => {
    try {
      const parsedData = sampleData.trim() ? JSON.parse(sampleData) : {};
      const result = testSchema(design, parsedData);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        error: `JSON parse error: ${err instanceof Error ? err.message : 'Invalid JSON'}`,
      });
    }
  }, [design, sampleData]);

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(design);
    }
  }, [design, onSave]);

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport(design);
    }
  }, [design, onExport]);

  const handleClearTest = useCallback(() => {
    setSampleData('');
    setTestResult(null);
  }, []);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Schema Designer</h2>

      {/* Schema Name & Method */}
      <div style={styles.headerSection}>
        <label style={styles.label}>
          Schema Name:
          <input
            type="text"
            value={design.name}
            onChange={(e) => setDesign((prev) => ({ ...prev, name: e.target.value }))}
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Extraction Method:
          <select
            value={design.method}
            onChange={(e) => handleMethodChange(e.target.value as ExtractionMethod)}
            style={styles.select}
          >
            <option value="llm">LLM Extraction</option>
            <option value="vision">Vision Extraction</option>
            <option value="table">Table Detection</option>
            <option value="regex">Regex Extraction</option>
          </select>
        </label>

        <label style={styles.label}>
          Description:
          <input
            type="text"
            value={design.description}
            onChange={(e) =>
              setDesign((prev) => ({ ...prev, description: e.target.value }))
            }
            style={styles.input}
          />
        </label>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'builder' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('builder')}
        >
          Builder
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'test' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('test')}
        >
          Test
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'code' ? styles.activeTab : {}) }}
          onClick={() => setActiveTab('code')}
        >
          Code
        </button>
      </div>

      {/* Builder Tab */}
      {activeTab === 'builder' && (
        <div style={styles.tabContent}>
          <div style={styles.fieldsContainer}>
            <h3 style={styles.sectionTitle}>Fields</h3>
            {design.fields.length === 0 ? (
              <p style={styles.noFields}>No fields defined. Add a field to get started.</p>
            ) : (
              design.fields.map((field, index) => (
                <FieldEditor
                  key={index}
                  field={field}
                  index={index}
                  onChange={(updated) => updateField(index, updated)}
                  onRemove={() => removeField(index)}
                />
              ))
            )}
          </div>

          <div style={styles.addFieldSection}>
            <span style={styles.addFieldLabel}>Add Field:</span>
            {FieldTypeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => addField(opt.value)}
                style={styles.addFieldButton}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={styles.validationSection}>
            <button onClick={handleValidate} style={styles.validateButton}>
              Validate Schema
            </button>
            {validationResult && (
              <div
                style={{
                  ...styles.validationResult,
                  ...(validationResult.valid ? styles.valid : styles.invalid),
                }}
              >
                <strong>{validationResult.valid ? '✓ Valid' : '✗ Invalid'}</strong>
                {validationResult.errors.length > 0 && (
                  <div style={styles.errorList}>
                    Errors:
                    <ul>
                      {validationResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {validationResult.warnings.length > 0 && (
                  <div style={styles.warningList}>
                    Warnings:
                    <ul>
                      {validationResult.warnings.map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Test Tab */}
      {activeTab === 'test' && (
        <div style={styles.tabContent}>
          <div style={styles.testSection}>
            <h3 style={styles.sectionTitle}>Test Data (JSON)</h3>
            <textarea
              value={sampleData}
              onChange={(e) => setSampleData(e.target.value)}
              placeholder='{"fieldName": "sample value"}'
              style={styles.textarea}
              rows={10}
            />
            <div style={styles.testButtons}>
              <button onClick={handleTest} style={styles.testButton}>
                Run Test
              </button>
              <button onClick={handleClearTest} style={styles.clearButton}>
                Clear
              </button>
            </div>

            {testResult && (
              <div
                style={{
                  ...styles.testResult,
                  ...(testResult.success ? styles.testSuccess : styles.testError),
                }}
              >
                <strong>{testResult.success ? '✓ Test Passed' : '✗ Test Failed'}</strong>
                {testResult.success && testResult.data && (
                  <div style={styles.testData}>
                    <strong>Validated Data:</strong>
                    <pre style={styles.pre}>{JSON.stringify(testResult.data, null, 2)}</pre>
                  </div>
                )}
                {testResult.error && (
                  <div style={styles.testErrorMessage}>
                    <strong>Error:</strong>
                    <pre style={styles.pre}>{testResult.error}</pre>
                  </div>
                )}
                {testResult.issues && testResult.issues.length > 0 && (
                  <div style={styles.issuesList}>
                    <strong>Issues:</strong>
                    <ul>
                      {testResult.issues.map((issue, i) => (
                        <li key={i}>
                          {issue.message} {issue.path.length > 0 && `(at ${issue.path.join('.')})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Code Tab */}
      {activeTab === 'code' && (
        <div style={styles.tabContent}>
          <h3 style={styles.sectionTitle}>Generated Code</h3>
          <pre style={styles.codeBlock}>{serializeSchemaDesign(design)}</pre>
          <div style={styles.codeActions}>
            <button
              onClick={() => navigator.clipboard.writeText(serializeSchemaDesign(design))}
              style={styles.copyButton}
            >
              Copy to Clipboard
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={styles.actionButtons}>
        <button onClick={handleSave} style={styles.saveButton}>
          Save Schema
        </button>
        <button onClick={handleExport} style={styles.exportButton}>
          Export
        </button>
      </div>
    </div>
  );
};

// ============================================
// Styles
// ============================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '20px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
  },
  headerSection: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    fontSize: '14px',
    fontWeight: '500',
  },
  input: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    minWidth: '200px',
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    minWidth: '200px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
  },
  tabs: {
    display: 'flex',
    gap: '5px',
    borderBottom: '2px solid #eee',
    marginBottom: '20px',
  },
  tab: {
    padding: '10px 20px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#666',
  },
  activeTab: {
    color: '#007bff',
    borderBottom: '2px solid #007bff',
  },
  tabContent: {
    minHeight: '300px',
  },
  fieldsContainer: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '15px',
  },
  noFields: {
    color: '#999',
    fontStyle: 'italic',
  },
  fieldEditor: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '15px',
    backgroundColor: '#fafafa',
  },
  fieldHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  fieldIndex: {
    fontWeight: '600',
    color: '#666',
  },
  removeButton: {
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    padding: '5px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  fieldRow: {
    display: 'flex',
    gap: '15px',
    flexWrap: 'wrap',
    marginBottom: '10px',
  },
  nestedFields: {
    marginTop: '15px',
    paddingLeft: '20px',
    borderLeft: '3px solid #ccc',
  },
  noNested: {
    color: '#999',
    fontStyle: 'italic',
    margin: '10px 0',
  },
  addNestedButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    padding: '5px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    marginTop: '10px',
  },
  addFieldSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
  },
  addFieldLabel: {
    fontWeight: '600',
    marginRight: '10px',
  },
  addFieldButton: {
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  validationSection: {
    marginTop: '20px',
  },
  validateButton: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  validationResult: {
    marginTop: '15px',
    padding: '15px',
    borderRadius: '8px',
  },
  valid: {
    backgroundColor: '#d4edda',
    border: '1px solid #c3e6cb',
  },
  invalid: {
    backgroundColor: '#f8d7da',
    border: '1px solid #f5c6cb',
  },
  errorList: {
    marginTop: '10px',
    color: '#721c24',
  },
  warningList: {
    marginTop: '10px',
    color: '#856404',
  },
  testSection: {
    marginBottom: '20px',
  },
  textarea: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'monospace',
    resize: 'vertical',
  },
  testButtons: {
    display: 'flex',
    gap: '10px',
    marginTop: '10px',
  },
  testButton: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  clearButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  testResult: {
    marginTop: '20px',
    padding: '15px',
    borderRadius: '8px',
  },
  testSuccess: {
    backgroundColor: '#d4edda',
    border: '1px solid #c3e6cb',
  },
  testError: {
    backgroundColor: '#f8d7da',
    border: '1px solid #f5c6cb',
  },
  testData: {
    marginTop: '10px',
  },
  testErrorMessage: {
    marginTop: '10px',
    color: '#721c24',
  },
  pre: {
    backgroundColor: '#f8f9fa',
    padding: '10px',
    borderRadius: '4px',
    overflow: 'auto',
    fontSize: '13px',
  },
  issuesList: {
    marginTop: '10px',
    color: '#721c24',
  },
  codeBlock: {
    backgroundColor: '#f8f9fa',
    padding: '15px',
    borderRadius: '8px',
    overflow: 'auto',
    fontSize: '13px',
    fontFamily: 'monospace',
    border: '1px solid #ddd',
  },
  codeActions: {
    marginTop: '15px',
  },
  copyButton: {
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  actionButtons: {
    display: 'flex',
    gap: '10px',
    marginTop: '30px',
    paddingTop: '20px',
    borderTop: '2px solid #eee',
  },
  saveButton: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    padding: '12px 30px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
  },
  exportButton: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    padding: '12px 30px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
  },
};

export default SchemaDesigner;
export {
  buildZodSchema,
  testSchema,
  validateSchemaDesign,
  formatZodError,
  serializeSchemaDesign,
  deserializeSchemaDesign,
  generateSchemaId,
  createEmptySchemaDesign,
  createDefaultField,
};
