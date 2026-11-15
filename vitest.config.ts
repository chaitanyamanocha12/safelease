import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/agent/**/*.test.ts", "tests/components/**/*.test.tsx"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: "forks",
  },
});
