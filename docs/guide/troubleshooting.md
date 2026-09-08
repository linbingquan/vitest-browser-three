# Troubleshooting

## WebGPU Not Available

### Symptom

```
[vitest-browser-three] gpuTest "test": skipping "webgpu" backend is not available in this environment.
```

### Causes

1. **Browser doesn't support WebGPU**
2. **WebGPU is disabled in browser flags**
3. **Headless mode doesn't expose WebGPU** (Playwright limitation)

### Solution

Tests will still run against the WebGL fallback. To force WebGPU in non-headless mode:

```ts
// vite.config.ts
browser: {
  provider: playwright({
    launchOptions: {
      args: ["--enable-unsafe-webgpu"],
    },
  }),
},
```

## Shader Compilation Errors

### Symptom

Tests silently pass with all zeros (canary failure):

```
[vitest-browser-three] Error: gpuTest "nan-literal": the compute kernel never ran (canary mismatch — got 0.0, expected 1234.0). This usually means the shader failed to build...
```

### Common Causes

1. **NaN literal in shader**: `float(Number.NaN)` is invalid WGSL
2. **Division by zero**: Static division by zero
3. **Type mismatches**: Passing wrong type to TSL functions

### Debugging

Check browser console for WebGPU validation errors:

```
THREE.WebGPURenderer: Compute pipeline creation failed
Error while parsing WGSL: expected ')'
```

## Buffer Registration Errors

### Symptom

```
TypeError: Cannot read properties of undefined (reading 'size')
```

### Cause

On three.js r0.185, unused storage nodes can break buffer registration for other attributes.

### Solution

Only create storage buffers that are actually used in the kernel:

```ts
// BAD
const unused = storage(new Float32Array([0]), "float", 0);

// GOOD
const used = storage(new Float32Array([0]), "float", 0);
const kernel = Fn(() => {
  used.element(uint(0)).assign(float(1)); // used in kernel
})().compute(1);
```

## Precision Issues

### Symptom

Tests fail with small tolerance differences:

```
expected 1.000001, got 1.0
```

### Causes

1. **SwiftShader precision**: Software renderer has reduced precision
2. **f32/f64 divergence**: CPU uses f64, GPU uses f32

### Solutions

```ts
// Increase tolerance for transcendental functions
await gpuFuzzTest("sin", {
  tolerance: 1e-3, // Not 1e-6
});

// Use Math.fround for CPU constants
const rounded = Math.fround(0.1); // f32 rounded
closeRel(float(rounded), expected, 1e-5);
```

## WebGL Single-Read Limitation

### Symptom

Canary and data assertions share the same readback array.

### Cause

WebGL storage buffers are effectively single-read.

### Solution

The library handles this automatically — the canary and data comparisons share the same readback.

## GPU Rendering Mode

### Hardware vs Software

```bash
# Software (SwiftShader, default)
npx vitest

# Hardware (requires Vulkan GPU)
GPU_RENDER=hw npx vitest
```

### Limitations of Hardware Mode

- Requires working Vulkan ICD
- Chrome may silently fall back to SwiftShader
- WebGPU not available in headless mode (falls back to WebGL)

## Getting Help

If you encounter issues not covered here:

1. Check [docs/DECISIONS.md](https://github.com/linbingquan/vitest-browser-three/blob/main/docs/DECISIONS.md) for known limitations
2. Search [existing issues](https://github.com/linbingquan/vitest-browser-three/issues)
3. Open a new issue with reproduction steps
