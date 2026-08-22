// Auto-cleanup integration for vitest `setupFiles`.
//
// Usage in vite/vitest config:
//   test: { setupFiles: ["vitest-browser-three/setup"] }
//
// Disposes the shared GPU renderer once per test file, freeing GPU memory
// without requiring boilerplate in every test file.
import { afterAll } from "vitest";
import { disposeRenderer } from "./context.js";

afterAll(async () => {
  await disposeRenderer();
});
