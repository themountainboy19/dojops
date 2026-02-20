import { ZodTypeAny } from "zod";

/**
 * Converts a Zod schema into a human-readable string for LLM prompts.
 * Walks schema._def to extract field names, types, required/optional, defaults, descriptions.
 */
export function zodSchemaToText(schema: ZodTypeAny): string {
  const def = schema?._def;

  if (!def?.typeName) {
    return "(no schema)";
  }

  // Handle ZodObject — the main case for tool input schemas
  if (def.typeName === "ZodObject") {
    const shape = def.shape() as Record<string, ZodTypeAny>;
    const lines: string[] = [];

    for (const [key, fieldSchema] of Object.entries(shape)) {
      lines.push(describeField(key, fieldSchema));
    }

    return lines.join("\n");
  }

  // Fallback for non-object schemas
  return describeType(schema);
}

function describeField(name: string, schema: ZodTypeAny): string {
  let innerSchema = schema;
  let isOptional = false;
  let defaultValue: unknown = undefined;
  let hasDefault = false;

  // Unwrap ZodDefault
  if (innerSchema._def.typeName === "ZodDefault") {
    hasDefault = true;
    defaultValue = innerSchema._def.defaultValue();
    innerSchema = innerSchema._def.innerType as ZodTypeAny;
  }

  // Unwrap ZodOptional
  if (innerSchema._def.typeName === "ZodOptional") {
    isOptional = true;
    innerSchema = innerSchema._def.innerType as ZodTypeAny;
  }

  const typeStr = describeType(innerSchema);
  const description = innerSchema._def.description as string | undefined;

  const parts = [name];
  parts.push(` (${typeStr}`);

  if (hasDefault) {
    parts.push(`, optional, default: ${JSON.stringify(defaultValue)}`);
  } else if (isOptional) {
    parts.push(", optional");
  } else {
    parts.push(", required");
  }

  parts.push(")");

  if (description) {
    parts.push(` - ${description}`);
  }

  return parts.join("");
}

function describeType(schema: ZodTypeAny): string {
  const def = schema._def;

  switch (def.typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodEnum":
      return (def.values as string[]).map((v: string) => `"${v}"`).join(" | ");
    case "ZodArray":
      return `array of ${describeType(def.type as ZodTypeAny)}`;
    case "ZodDefault":
      return describeType(def.innerType as ZodTypeAny);
    case "ZodOptional":
      return describeType(def.innerType as ZodTypeAny);
    default:
      return def.typeName?.replace("Zod", "").toLowerCase() ?? "unknown";
  }
}
