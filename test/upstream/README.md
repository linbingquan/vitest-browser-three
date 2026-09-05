# Upstream TSL tests

Tests in this directory are translated from three.js's GPU-native TSL unit
tests (`test/unit/addons/tsl/*.tests.js`, prototype from
https://github.com/mrceel/three.js/pull/34331 — see also the upstream PR
tracked in `docs/DECISIONS.md`), MIT license, and adapted from QUnit to
Vitest Browser Mode using this library's `gpuTest` API.

They are a **one-time snapshot**, not auto-synced with upstream. Revisit on
three.js version upgrades: check upstream for new or changed cases worth
porting, then update the source commit below.

Source commits:

- `1e4dcdc0910e6a42bd13f5a905e4a27bffed845c` (TSLBlendModes)
- `6a4a0f99a62adcb9ca9c7cbf38c26f0a099166c1` (GPUAtomicsStorage)
