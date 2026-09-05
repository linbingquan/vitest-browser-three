# Upstream TSL tests

Tests in this directory are adapted from three.js's GPU-native TSL unit
tests (`test/unit/addons/tsl/*.tests.js`, MIT license). They serve as
**API validation examples** — using upstream test logic to verify that this
library's APIs correctly exercise the GPU.

Files are organized by the library API they validate:

- `gpu-test.test.ts` — validates `gpuTest` (batch assertions)
- `raw-compute.test.ts` — validates `rawComputeTest` and integer readback helpers

This is **not** a full migration of upstream tests. It is a curated snapshot:
select cases are ported when they exercise an API path we need to validate.
Revisit on three.js version upgrades: if an upstream case breaks due to API
changes, update or drop the ported example accordingly.

Relevant upstream PRs:

- `gpu-test-utils.js`: #34331, #34427
- `gpu-raw-test-utils.js`: #34431
