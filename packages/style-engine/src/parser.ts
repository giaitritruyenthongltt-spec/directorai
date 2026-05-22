import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { ValidationError } from '@directorai/shared';
import { StyleSchema, type Style } from './schema.js';

export function parseStyle(yamlText: string): Style {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    throw new ValidationError('Style YAML is not valid YAML', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const result = StyleSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError('Style YAML failed schema validation', {
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function serializeStyle(style: Style): string {
  return stringifyYaml(style, { indent: 2, lineWidth: 100 });
}

export function mergeStyles(base: Style, override: Partial<Style>): Style {
  return StyleSchema.parse({ ...base, ...override });
}
