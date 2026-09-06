# vitest-browser-three

GPU-native assertions for [three.js](https://threejs.org) TSL expressions, running in
[Vitest Browser Mode](https://vitest.dev/guide/browser/).

Instead of mocking the GPU away, every assertion is compiled to a compute
shader, executed on a real GPU (WebGPU, with a WebGL2 fallback path), and the
results are read back and compared on the CPU — so failures report actual vs.
expected values instead of a bare test id.

## Documentation

> **For detailed documentation, examples, and API reference, see [docs/guide](./docs/guide/README.md).**

## Install

```bash
npm install three @types/three
npm install -D @vitest/browser @vitest/browser-playwright playwright vitest
```

> You can also use pnpm, yarn or other package managers.

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
  absolute: true, // for periodic functions near zero crossings
});
```

## Features

- **Batch assertions**: One compute dispatch per test suite
- **Multi-backend**: WebGPU with WebGL2 fallback, soft-skipped when unavailable
- **Fuzz testing**: Deterministic inputs with CPU reference comparison, supporting both relative and absolute tolerance
- **Type-safe**: Full TypeScript support

## Compatibility

This library is developed and tested against `three@0.185.x` and `vitest@4.x`.

It declares `three >=0.185.0` and `vitest >=4.0.0` as peer dependencies to allow flexibility. If you upgrade to a newer version and encounter issues:

1. Check the runtime error messages for clues
2. Consider pinning the dependency temporarily
3. Open an issue with your three/vitest version if you believe it's a bug

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, testing conventions, and release process.

Design decisions are documented in [docs/DECISIONS.md](./docs/DECISIONS.md).

## License

MIT
