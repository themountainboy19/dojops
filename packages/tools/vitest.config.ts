import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@odaops/core": path.resolve(__dirname, "../core/src"),
      "@odaops/sdk": path.resolve(__dirname, "../sdk/src"),
    },
  },
});
