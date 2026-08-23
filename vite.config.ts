import { defineConfig } from "vite-plus";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      headless: true,
      screenshotFailures: false,
      // Cast: vite-plus' defineConfig types lag behind vitest 4's provider factory API.
      provider: playwright({
        launchOptions: {
          // Default to software rendering (works in restricted containers).
          // Set GPU_RENDER=hw to use the machine's real GPU via ANGLE's
          // Vulkan backend; without it Chrome headless prefers its bundled
          // SwiftShader even when a hardware ICD is available.
          args: [
            "--enable-unsafe-webgpu",
            ...(process.env.GPU_RENDER?.toLowerCase() === "hw"
              ? ["--use-angle=vulkan"]
              : ["--enable-features=Vulkan", "--use-angle=swiftshader"]),
          ],
          // Some dev containers export VK_LOADER_DRIVERS_SELECT=*nvidia*, which
          // hides all non-NVIDIA Vulkan ICDs and breaks ANGLE/SwANGLE init
          // (getContext("webgl2") returns null). Drop the restriction so the
          // loader can find any usable ICD (e.g. mesa lavapipe).
          env: { ...process.env, VK_LOADER_DRIVERS_SELECT: undefined },
        },
      }) as never,
      instances: [{ browser: "chromium" }],
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: ["src/index.ts", "src/setup.ts"],
    dts: {
      tsgo: true,
    },
    exports: true,
    external: ["three", "three/tsl", "three/webgpu", /^vitest($|\/)/, /^@vitest\//],
  },
  fmt: {
    tabWidth: 2,
    semi: true,
    singleQuote: false,
    endOfLine: "lf",
    ignorePatterns: ["dist", "node_modules"],
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ["dist", "node_modules"],
  },
});
