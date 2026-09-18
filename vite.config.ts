import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    target: "es2020",
    // MediaPipe's runtime (WASM) and both models are static files under public/, never bundled.
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
