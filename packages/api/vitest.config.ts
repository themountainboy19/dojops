import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@oda/core": path.resolve(__dirname, "../core/src"),
      "@oda/sdk": path.resolve(__dirname, "../sdk/src"),
      "@oda/planner": path.resolve(__dirname, "../planner/src"),
      "@oda/tools": path.resolve(__dirname, "../tools/src"),
      "@oda/executor": path.resolve(__dirname, "../executor/src"),
    },
  },
});
