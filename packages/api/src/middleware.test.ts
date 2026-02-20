import { describe, it, expect, vi } from "vitest";
import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { validateBody, errorHandler } from "./middleware";

function mockReqRes(body: unknown) {
  const req = { body } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe("validateBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("calls next on valid body", () => {
    const { req, res, next } = mockReqRes({ name: "test" });
    validateBody(schema)(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid body", () => {
    const { req, res, next } = mockReqRes({ name: "" });
    validateBody(schema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Validation failed" }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe("errorHandler", () => {
  it("returns 400 for ZodError", () => {
    const schema = z.object({ x: z.string() });
    const result = schema.safeParse({ x: 123 });
    const zodErr = !result.success ? result.error : new ZodError([]);

    const { req, res, next } = mockReqRes({});
    errorHandler(zodErr, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Validation failed" }));
  });

  it("returns 500 for generic Error", () => {
    const { req, res, next } = mockReqRes({});
    errorHandler(new Error("boom"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Internal server error", message: "boom" }),
    );
  });
});
