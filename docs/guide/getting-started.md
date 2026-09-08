# Getting Started

## Installation

```bash
npm install -D three @types/three
npm install -D @vitest/browser @vitest/browser-playwright playwright vitest
npm install -D vitest-browser-three
```

## Configure Vitest Browser Mode

Add browser mode configuration to `vite.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          args: [
            "--enable-unsafe-webgpu",
            ...(process.env.GPU_RENDER?.toLowerCase() === "hw"
              ? ["--use-angle=vulkan"]
              : ["--enable-features=Vulkan", "--use-angle=swiftshader"]),
          ],
          env: { ...process.env, VK_LOADER_DRIVERS_SELECT: "" },
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
```

## Write Your First Test

```ts
import { it } from "vitest";
import { gpuTest } from "vitest-browser-three";
import { float, sin, vec3 } from "three/tsl";

it("vector math", async () => {
  await gpuTest("vector math", ({ eq, closeRel }) => {
    eq(float(2).add(3), float(5));
    closeRel(sin(float(Math.PI / 2)), 1, 1e-3);
    closeRel(vec3(1, 2, 3).mul(2), vec3(2, 4, 6));
  });
});
```

## Run Tests

```bash
# Use Vitest CLI directly
npx vitest

# Or if you defined a "test" script in package.json
npm test

# Hardware rendering (requires GPU with Vulkan)
GPU_RENDER=hw npx vitest
```

## Next Steps

- [Configuration](./configuration.md) - Backend selection and options
- [API Reference](./api/gpu-test.md) - All available assertion methods
