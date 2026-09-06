# Getting Started

## Installation

```bash
# Install peer dependencies
pnpm add three @types/three

# Install dev dependencies
pnpm add -D @vitest/browser @vitest/browser-playwright playwright vitest
```

> If you use Vite+, you can also use `vp add` instead of `pnpm add`.

## Configure Vitest Browser Mode

Add browser mode configuration to `vite.config.ts`:

```ts
import { defineConfig } from "vite-plus";
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

> If you're using standard `vitest/config` instead of `vite-plus`, replace the import accordingly.

## Write Your First Test

```ts
import { gpuTest } from "vitest-browser-three";
import { float, sin, vec3 } from "three/tsl";

await gpuTest("vector math", ({ eq, closeRel }) => {
  eq(float(2).add(3), float(5));
  closeRel(sin(float(Math.PI / 2)), float(1), 1e-3);
  closeRel(vec3(1, 2, 3).mul(2), vec3(2, 4, 6));
});
```

## Run Tests

```bash
# Software rendering (default, works in containers/CI)
vp test

# Hardware rendering (requires GPU with Vulkan)
GPU_RENDER=hw vp test
```

## Next Steps

- [Configuration](./configuration.md) - Backend selection and options
- [API Reference](./api/gpu-test.md) - All available assertion methods
- [Examples](./examples/) - More test examples
