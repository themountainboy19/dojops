import { describe, it, expect } from "vitest";
import { jsonSchemaToZod, JSONSchemaObject } from "../json-schema-to-zod";

describe("jsonSchemaToZod", () => {
  it("converts string type", () => {
    const schema: JSONSchemaObject = { type: "string" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse("hello").success).toBe(true);
    expect(zod.safeParse(42).success).toBe(false);
  });

  it("converts string with description", () => {
    const schema: JSONSchemaObject = { type: "string", description: "A name" };
    const zod = jsonSchemaToZod(schema);
    expect(zod._def.description).toBe("A name");
  });

  it("converts string with default", () => {
    const schema: JSONSchemaObject = { type: "string", default: "hello" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(undefined)).toBe("hello");
  });

  it("converts number type", () => {
    const schema: JSONSchemaObject = { type: "number" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse(3.14).success).toBe(true);
    expect(zod.safeParse("abc").success).toBe(false);
  });

  it("converts integer type", () => {
    const schema: JSONSchemaObject = { type: "integer" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse(42).success).toBe(true);
    expect(zod.safeParse(3.14).success).toBe(false);
  });

  it("converts number with default", () => {
    const schema: JSONSchemaObject = { type: "number", default: 10 };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(undefined)).toBe(10);
  });

  it("converts boolean type", () => {
    const schema: JSONSchemaObject = { type: "boolean" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse(true).success).toBe(true);
    expect(zod.safeParse("yes").success).toBe(false);
  });

  it("converts boolean with default", () => {
    const schema: JSONSchemaObject = { type: "boolean", default: false };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(undefined)).toBe(false);
  });

  it("converts enum", () => {
    const schema: JSONSchemaObject = { enum: ["a", "b", "c"] };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse("a").success).toBe(true);
    expect(zod.safeParse("d").success).toBe(false);
  });

  it("converts enum with description", () => {
    const schema: JSONSchemaObject = { enum: ["x", "y"], description: "Options" };
    const zod = jsonSchemaToZod(schema);
    expect(zod._def.description || zod._def.innerType?._def?.description).toBe("Options");
  });

  it("converts array of strings", () => {
    const schema: JSONSchemaObject = {
      type: "array",
      items: { type: "string" },
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse(["a", "b"]).success).toBe(true);
    expect(zod.safeParse("not-array").success).toBe(false);
    expect(zod.safeParse([1, 2]).success).toBe(false);
  });

  it("converts array with default", () => {
    const schema: JSONSchemaObject = {
      type: "array",
      items: { type: "string" },
      default: ["default"],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(undefined)).toEqual(["default"]);
  });

  it("converts simple object", () => {
    const schema: JSONSchemaObject = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse({ name: "Alice" }).success).toBe(true);
    expect(zod.safeParse({ name: "Alice", age: 30 }).success).toBe(true);
    expect(zod.safeParse({ age: 30 }).success).toBe(false); // missing required name
  });

  it("makes non-required fields optional", () => {
    const schema: JSONSchemaObject = {
      type: "object",
      properties: {
        required_field: { type: "string" },
        optional_field: { type: "string" },
      },
      required: ["required_field"],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse({ required_field: "hello" }).success).toBe(true);
  });

  it("handles nested objects", () => {
    const schema: JSONSchemaObject = {
      type: "object",
      properties: {
        config: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            port: { type: "number" },
          },
          required: ["enabled"],
        },
      },
      required: ["config"],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse({ config: { enabled: true } }).success).toBe(true);
    expect(zod.safeParse({ config: { port: 8080 } }).success).toBe(false);
  });

  it("converts object without properties to record", () => {
    const schema: JSONSchemaObject = { type: "object" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse({ any: "thing" }).success).toBe(true);
  });

  it("handles unknown type as z.unknown()", () => {
    const schema: JSONSchemaObject = {};
    const zod = jsonSchemaToZod(schema);
    expect(zod.safeParse("anything").success).toBe(true);
    expect(zod.safeParse(42).success).toBe(true);
  });

  it("produced schema has correct Zod typeName for zodSchemaToText compatibility", () => {
    const schema: JSONSchemaObject = {
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "number" },
        enabled: { type: "boolean" },
        tags: { type: "array", items: { type: "string" } },
        mode: { enum: ["fast", "slow"] },
      },
      required: ["name"],
    };
    const zod = jsonSchemaToZod(schema);

    // The top-level should be a ZodObject
    expect(zod._def.typeName).toBe("ZodObject");

    // It should have a shape() function
    const shape = zod._def.shape();
    expect(shape).toBeDefined();
    expect(shape.name).toBeDefined();
    expect(shape.count).toBeDefined();
  });

  it("handles field with default not being marked optional", () => {
    const schema: JSONSchemaObject = {
      type: "object",
      properties: {
        port: { type: "number", default: 3000 },
      },
    };
    const zod = jsonSchemaToZod(schema);
    // Port has a default, so parsing undefined should use default
    const result = zod.parse({ port: undefined });
    expect(result.port).toBe(3000);
  });
});
