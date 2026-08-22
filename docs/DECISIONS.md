# Design Decisions & Platform Findings

> 集中记录开发过程中的重要决策与实测平台怪癖，避免重复调研。
> 本项目目前为未发布单人项目，采用轻量级单一文档而非完整 ADR；
> 若未来贡献者增多，可平滑升级为 ADR 目录。

## Upstream alignment

对齐对象：three.js PR [#34331](https://github.com/mrdoob/three.js/pull/34331)
的原型 `gpu-test-utils.js`（QUnit 适配）。

| 维度             | three.js PR #34331                         | 本库选择                      | 理由                                        |
| ---------------- | ------------------------------------------ | ----------------------------- | ------------------------------------------- |
| gpuFuzzTest 形态 | `(name, count, buildFn, options)` 位置参数 | `(name, spec)` 对象           | 自文档化；CPU 参考值是本库核心目的          |
| fuzz 输入生成    | GPU 端 `hash(instanceIndex)`               | CPU 确定性函数 → storage 缓冲 | 支持任意分布；与 CPU expected 函数模型匹配  |
| 每实例多断言     | site 预算制（`maxSitesPerInstance`）       | 单一 `test` 表达式            | 规避 WebGL2 transform-feedback 缓冲预算问题 |
| message 参数     | 有                                         | 有                            | 已实现并有测试与文档覆盖                    |

**总体策略**：自主维护实现、吸收上游设计思想，不依赖深度耦合 QUnit 的
原型代码；持续监控 `test/unit/addons/tsl/gpu-test-utils.js` 的提交，待上
游毕业成正式 API 后再评估切换或提供兼容层。（实测：原型提交 `5132c1fa`
后至今零演进。）

## Platform findings

### WebGL2 transform-feedback 寻址约束

- **发现**：除裸 `instanceIndex` 节点外的任何写入目标（算术偏移、JS 常量
  索引）都会塌缩到 slot 0。
- **影响**：批量分发必须用 `If(instanceIndex.equal(row), ...)` 定址；每实
  例恰好一行时（如旧版 gpuTest 的单调用 pass）instanceIndex 恒为 0，必须
  用常量索引——两种模式不可混用需按 dispatch 结构选择。

### three r0.185 未使用 storage 节点破坏缓冲注册

- **发现**：创建了但从未在 kernel 中使用的 storage 节点，会导致其他被使
  用属性的后端缓冲注册失败（`getArrayBufferAsync` 报 `'size' of undefined`）。
- **影响**：gpuTest 的空断言守卫必须在读取 `expectedStorage` **之前**
  拦截（零断言时该缓冲从未被 kernel 写入）。

### TSL `mat4(Matrix4)` 转置差异

- **发现**：TSL 的 `mat4(Matrix4)` 相对 `Matrix4.elements`（列主序）存在
  转置关系。
- **影响**：矩阵测试应通过变换行为验证（如旋转后的向量），而非裸元素比较。

### Canary 静默失败检测

- **发现**：shader 编译失败（如 NaN literal 进入生成的 WGSL）时，
  `computeAsync` 可能**不 reject**，只异步 console.error；所有缓冲读回
  零初始化，全部断言会以 0-vs-0 静默假通过。
- **决策**：缓冲预留一行无条件写 canary `12345.6789`，回读后先检查；
  缺失即抛出带诊断信息的错误。WebGL2 存储缓冲只能读一次，canary 与数据
  比较共享同一次读取的数组。

## Dependency strategy

- `three` 与 `vitest` / `@vitest/*` 一律 external，绝不内联（曾因
  setup.ts 引入 vitest 导致 vp pack 自动内联 vitest 内部包，已修复）。
- `three >=0.185.0` 与 `vitest >=4.0.0` 声明为 peerDependencies；
  setup 子路径运行时直接 import vitest，要求项目直接依赖它。

## API cleanup

- 首次发布前移除了 legacy 别名 `expectClose` / `expect` 及其专属的
  floor-1 容差公式（原 `legacyCloseRel`）；相对容差统一为标准公式
  `|a-e| <= tol * max(|a|, |e|, 1e-12)`。
- `expectValue` 一并移除：CPU 常量可直接传给 `closeAbs` / `closeRel`
  （内部经 `cpuToNode()` 统一转换）。
