'use strict';

/**
 * Validate tool-call arguments against the tool's JSON Schema parameters.
 * Returns null if valid, or an error string describing the violation.
 *
 * Checks:
 * 1. Arguments must be a plain object
 * 2. All required properties must be present
 * 3. No extra properties beyond what the schema defines (unless additionalProperties is true)
 * 4. Basic type checking per property (string, number, integer, boolean, array, object)
 */
function validateToolArgs(args, schema) {
  if (!schema || typeof schema !== 'object') return null; // no schema to validate against

  if (args === null || args === undefined || typeof args !== 'object' || Array.isArray(args)) {
    return 'Arguments must be a plain object';
  }

  const properties = schema.properties || {};
  const required = schema.required || [];

  // Check required fields
  for (const field of required) {
    if (!(field in args)) {
      return `Missing required argument: "${field}"`;
    }
  }

  // Check for extra properties not defined in schema
  if (schema.additionalProperties === false || !('additionalProperties' in schema)) {
    const allowed = new Set(Object.keys(properties));
    for (const key of Object.keys(args)) {
      if (!allowed.has(key)) {
        return `Unexpected argument: "${key}"`;
      }
    }
  }

  // Basic type validation per property
  for (const [key, value] of Object.entries(args)) {
    const propSchema = properties[key];
    if (!propSchema || !propSchema.type) continue;

    const expectedType = propSchema.type;
    const actual = value;

    if (actual === null || actual === undefined) {
      // null/undefined are OK for optional fields, will be caught by required check
      continue;
    }

    let valid = true;
    switch (expectedType) {
      case 'string':  valid = typeof actual === 'string'; break;
      case 'number':  valid = typeof actual === 'number' && !isNaN(actual); break;
      case 'integer': valid = typeof actual === 'number' && Number.isInteger(actual); break;
      case 'boolean': valid = typeof actual === 'boolean'; break;
      case 'array':   valid = Array.isArray(actual); break;
      case 'object':  valid = typeof actual === 'object' && !Array.isArray(actual); break;
      default:        valid = true; // unknown type — skip
    }
    if (!valid) {
      return `Argument "${key}" must be of type ${expectedType}`;
    }
  }

  return null; // valid
}

module.exports = { validateToolArgs };
