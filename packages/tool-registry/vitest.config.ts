import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@dojops/sdk": path.resolve(__dirname, "../sdk/src"),
      "@dojops/core": path.resolve(__dirname, "../core/src"),
      "@dojops/tools": path.resolve(__dirname, "../tools/src"),
    },
  },
});
