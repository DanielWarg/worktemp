import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [".context/**", "mcp/**", "node_modules/**"],
  },
});
