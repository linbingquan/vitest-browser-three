# vitest-browser-three

GPU-native assertions for [three.js](https://threejs.org) TSL expressions, running in
[Vitest Browser Mode](https://vitest.dev/guide/browser/).

> Currently maintained by an individual developer
> ([@linbingquan](https://github.com/linbingquan)); the repository structure and
> API conventions follow the official vitest-browser-* community plugins, with
> the long-term goal of joining the Vitest community. Contributions welcome.

Instead of mocking the GPU away, every assertion is compiled to a compute
shader, executed on a real GPU (WebGPU, with a WebGL2 fallback path), and the
results are read back and compared on the CPU — so failures report actual vs.
expected values instead of a bare test id.

## Documentation

> **For detailed documentation, examples, and API reference, see [docs/guide](./docs/guide/README.md).**

## Install

```bash
pnpm add three @types/three
pnpm add -D @vitest/browser @vitest/browser-playwright playwright vitest
```

> If you use Vite+, you can also use `vp add` instead of `pnpm add`.

## Quick Start

```ts
import { gpuTest, gpuFuzzTest } from "vitest-browser-three";
import { float, sin } from "three/tsl";

// Declarative assertions
await gpuTest("scalar math", ({ eq, closeRel }) => {
  eq(float(2).add(3), float(5));
  closeRel(sin(float(Math.PI / 2)), 1, 1e-3);
});

// Fuzz testing
await gpuFuzzTest("sin", {
  instances: 128,
  input: (i) => (i / 128) * Math.PI * 2,
  test: (x) => sin(x),
  expected: (x) => Math.sin(x),
  tolerance: 1e-3,
});
```

## Features

- **Batch assertions**: One compute dispatch per test suite
- **Multi-backend**: WebGPU with WebGL2 fallback, soft-skipped when unavailable
- **Fuzz testing**: Deterministic inputs with CPU reference comparison
- **Type-safe**: Full TypeScript support

## Development

```bash
pnpm install   # install dependencies
pnpm check     # format + lint + typecheck
pnpm test      # browser-mode tests (requires playwright chromium)
```

## License

MIT
