import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@odaops/sdk": path.resolve(__dirname, "../sdk/src"),
    },
  },
});
