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
          args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"],
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
