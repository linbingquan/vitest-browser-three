// Explicit opt-in disposal for use with vitest `setupFiles`.
//
// The default entry (`vitest-browser-three`) already registers this cleanup;
// import `vitest-browser-three/setup` only if you import the API from
// `vitest-browser-three/pure` (side-effect free) and still want disposal:
//   test: { setupFiles: ["vitest-browser-three/setup"] }
//
// Disposes the shared GPU renderer once per test file, freeing GPU memory
// without requiring boilerplate in every test file.
import { afterAll } from "vitest";
import { disposeRenderer } from "./context.js";

afterAll(async () => {
  await disposeRenderer();
});
