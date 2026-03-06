import { describe, it, expect } from "vitest";
import { classifyPlanRisk } from "../risk-classifier";

/** Classify a single task and assert the expected risk level. */
function expectRisk(tool: string, description: string, expected: "LOW" | "MEDIUM" | "HIGH"): void {
  const risk = classifyPlanRisk([{ tool, description }]);
  expect(risk).toBe(expected);
}

describe("classifyPlanRisk", () => {
  it("returns LOW for GitHub Actions CI job", () => {
    expectRisk("github-actions", "Create CI pipeline for Node.js app", "LOW");
  });

  it("returns LOW for Makefile generation", () => {
    expectRisk("makefile", "Create Makefile for build automation", "LOW");
  });

  it("returns LOW for Prometheus config", () => {
    expectRisk("prometheus", "Create alerting rules", "LOW");
  });

  it("returns MEDIUM for Dockerfile modification", () => {
    expectRisk("dockerfile", "Create multi-stage Dockerfile", "MEDIUM");
  });

  it("returns MEDIUM for Terraform without high-risk keywords", () => {
    expectRisk("terraform", "Create S3 bucket", "MEDIUM");
  });

  it("returns MEDIUM for Kubernetes deployment", () => {
    expectRisk("kubernetes", "Deploy application", "MEDIUM");
  });

  it("returns HIGH for IAM policy task", () => {
    expectRisk("terraform", "Create IAM policy for S3 access", "HIGH");
  });

  it("returns HIGH for security group modifications", () => {
    expectRisk("terraform", "Update security group rules", "HIGH");
  });

  it("returns HIGH for production deployment", () => {
    expectRisk("kubernetes", "Deploy to production cluster", "HIGH");
  });

  it("returns HIGH for secret management", () => {
    expectRisk("ansible", "Configure secret rotation", "HIGH");
  });

  it("returns HIGH for RBAC configuration", () => {
    expectRisk("kubernetes", "Set up RBAC for service accounts", "HIGH");
  });

  it("returns highest risk when mixed tasks", () => {
    const risk = classifyPlanRisk([
      { tool: "github-actions", description: "Create CI pipeline" },
      { tool: "terraform", description: "Create IAM role for deployment" },
    ]);
    expect(risk).toBe("HIGH");
  });

  it("returns LOW for empty task list", () => {
    expect(classifyPlanRisk([])).toBe("LOW");
  });
});
