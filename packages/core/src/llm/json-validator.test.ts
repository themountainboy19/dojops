import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseAndValidate, JsonValidationError } from "./json-validator";

const TestSchema = z.object({
  name: z.string(),
  count: z.number(),
});

describe("parseAndValidate", () => {
  it("parses clean JSON matching schema", () => {
    const result = parseAndValidate('{"name": "test", "count": 42}', TestSchema);
    expect(result).toEqual({ name: "test", count: 42 });
  });

  it("strips markdown fences before parsing", () => {
    const raw = '```json\n{"name": "fenced", "count": 7}\n```';
    const result = parseAndValidate(raw, TestSchema);
    expect(result).toEqual({ name: "fenced", count: 7 });
  });

  it("throws JsonValidationError on invalid JSON", () => {
    expect(() => parseAndValidate("not json", TestSchema)).toThrow(JsonValidationError);
    expect(() => parseAndValidate("not json", TestSchema)).toThrow("Failed to parse JSON");
  });

  it("throws JsonValidationError on schema mismatch", () => {
    expect(() => parseAndValidate('{"name": 123}', TestSchema)).toThrow(JsonValidationError);
    expect(() => parseAndValidate('{"name": 123}', TestSchema)).toThrow("Schema validation failed");
  });
});
