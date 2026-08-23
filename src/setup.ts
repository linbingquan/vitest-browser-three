// Explicit auto-cleanup integration for vitest `setupFiles`.
//
// The default entry point (`vitest-browser-three`) already registers this
// cleanup; import `vitest-browser-three/setup` instead when you want the
// side-effect-free API plus opt-in disposal, e.g.:
//   test: { setupFiles: ["vitest-browser-three/setup"] }
//
// Disposes the shared GPU renderer once per test file, freeing GPU memory
// without requiring boilerplate in every test file.
import { afterAll } from "vitest";
import { disposeRenderer } from "./context.js";

afterAll(async () => {
  await disposeRenderer();
});
