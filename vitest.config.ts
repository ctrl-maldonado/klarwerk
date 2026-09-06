import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    hookTimeout: 60_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
