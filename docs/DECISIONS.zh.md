# 设计决策与平台发现（中文译本）

> 英文原版：[`DECISIONS.md`](./DECISIONS.md)。本文为完整中文翻译，英文版为权威版本。

> 集中记录开发过程中的重要决策与实测平台怪癖，避免重复调研。
> 本项目目前为未发布单人项目，采用轻量级单一文档而非完整 ADR；若未来贡
> 献者增多，可平滑升级为 ADR 目录。
> 最后审阅：2026-08-23。

## 上游对齐

参照上游：three.js PR
[#34331](https://github.com/mrdoob/three.js/pull/34331)
的原型 `gpu-test-utils.js`（基于 QUnit）。

| 维度             | three.js PR #34331                         | 本库选择                      | 理由                                        |
| ---------------- | ------------------------------------------ | ----------------------------- | ------------------------------------------- |
| gpuFuzzTest 形态 | `(name, count, buildFn, options)` 位置参数 | `(name, spec)` 对象           | 自文档化；CPU 参考值是本库核心目的          |
| fuzz 输入生成    | GPU 端 `hash(instanceIndex)`               | CPU 确定性函数 → storage 缓冲 | 支持任意分布；与 CPU expected 函数模型匹配  |
| 每实例多断言     | site 预算制（`maxSitesPerInstance`）       | 单一 `test` 表达式            | 规避 WebGL2 transform-feedback 缓冲预算问题 |
| message 参数     | 有                                         | 有                            | 已实现并有测试与文档覆盖                    |

**总体策略**：自主维护实现、吸收上游设计思想（canary 检测、裸
instanceIndex 寻址、AssertWriteNode 式类型解析），不依赖深度耦合 QUnit
的原型代码。持续监控 `test/unit/addons/tsl/gpu-test-utils.js` 的提交，待
上游毕业成正式 API 后再评估切换或提供兼容层。（实测：原型提交
`5132c1fa` 后至今零演进。）

## 平台发现

### WebGL2 transform-feedback 寻址约束

- **发现**：除裸 `instanceIndex` 节点外的任何写入目标（算术偏移、JS 常量
  索引）都会塌缩到 slot 0。
- **影响**：批量分发必须用 `If(instanceIndex.equal(row), ...)` 定址。当
  每次 pass 恰好只分发一个实例（如旧版单调用 gpuTest）时 instanceIndex
  恒为 0，必须用常量索引——两种模式不可混用，需按 dispatch 结构选择。

### three r0.185 未使用 storage 节点破坏缓冲注册

- **发现**：创建了但从未在 kernel 中使用的 storage 节点，会导致其他被使
  用属性的后端缓冲注册失败（`getArrayBufferAsync` 抛 `'size' of undefined`）。
- **影响**：gpuTest 的空断言守卫必须在读取 `expectedStorage` **之前**
  拦截——零断言时该缓冲从未被 kernel 写入。

### TSL `mat4(Matrix4)` 转置差异

- **发现**：TSL 的 `mat4(Matrix4)` 相对 `Matrix4.elements`（列主序）存在
  转置关系。
- **影响**：矩阵测试应通过变换行为验证（如变换后的向量），而非裸元素比较。

### Canary 静默失败检测

- **发现**：shader 构建失败（如 NaN literal 进入生成的 WGSL）时，
  `computeAsync` 可能**不 reject**，只异步 console.error；所有缓冲读回
  零初始化，全部断言以 0-vs-0 静默假通过。
- **决策**：缓冲预留一行无条件写 canary `12345.6789`，回读后先检查，缺失
  即抛出带诊断信息的错误。WebGL2 存储缓冲实际只能读一次，canary 与数据比
  较共享同一次读取的数组。

### TSL `color()` 节点类型归一化

- **发现**：`color(hex)` 产生的节点解析类型是 `"color"` 而非 `"vec3"`，
  尽管它在 shader 中行为与 vec3 一致。
- **决策**：AssertionNode 在类型比较前将 `"color"` 归一化为 `"vec3"`，
  使 `closeRel(colorNode, [r, g, b])` 可直接使用。

### fp32/f64 在不连续点的分歧（fuzz 参考值）

- **发现**：fuzz 输入上传前被舍入为 f32，但 CPU 参考值由 f64 原值计算。
  在 `fract`/`step` 阈值附近两者可能落在不连续点两侧，即使双方都"正确"
  也会失败。
- **决策**：(1) `expected(x, i)` 接收 f32 舍入后的输入（`Math.fround`），
  与 GPU 实际接收一致；(2) fuzz 扫描用半步采样 `(i + 0.5) / n`，输入永不
  精确落在不连续点上；(3) CPU 参考比较 shader 字面量时使用 f32 舍入后的
  常数（`Math.fround(0.15)` 而非 `0.15`）。

### 真实场景片段覆盖

现有片段：条纹着色（Fn/step/abs/mix/color）、动画扭曲条纹
（uv/time/distance/fract/negate）、If/Else 条件选色、风格化边缘光照
（normalize/dot/max/pow/smoothstep/clamp，三 vec3 输入 Fn）。

新片段的收录标准：必须覆盖尚未测试的编译模式；几何/渲染上下文节点
（positionLocal、uv、time）必须重构为显式参数。

## 插件与 fixture 扩展性

- 当前断言集（eq/closeAbs/closeRel/关系断言）是封闭的，对首次发布而言已
  足够。
- 自定义比较 kind 的插件系统未来可行且无需 GPU 侧改动：所有比较都在回读
  后的 CPU 侧完成，改造成本仅是将 `compareComponents`/`describeFailure`
  改为注册表（轻到中）。
- Vitest fixture 扩展（`test.extend()`）可行：将 `gpuTest` 包装为 harness
  工厂（返回 assert/run/dispose）；如 fixture 需要隔离实例，渲染器单例可
  改为可注入（中等成本）。
- 两者均不强制破坏现有 `gpuTest` 签名——无需发布前铺垫。

## 多后端策略

- 套件默认跑双后端：`['webgpu', 'webgl']`（后者是 `forceWebGL: true` 的
  `WebGPURenderer`）。
- 不可用后端软跳过（console.warn）；仅当所有请求的后端都不可用时才失败。
- `configureGPU({ backends })` 设置库级默认；单次调用的 `backends` 选项
  优先。
- 后端内失败在错误信息末尾追加 `[backend: xxx]` 标签（只追加不替换，避
  免破坏基于正则的断言匹配）。

## 渲染器缓存

- 渲染器按后端缓存；init 失败会被记住（failed 标记）使探测保持廉价。
- 缓存 promise 上附加非重抛的 `.catch` 标记失败并记录日志，同时保留原始
  rejection 给首个调用者——后续调用经 failed 标记同步抛错（无
  unhandledrejection 噪音）。

## 底层计算缓冲回读

- **决策**：整数回读辅助函数要求传入底层 storage attribute（`node.value`），
  而非 TSL 节点本身。这提供了编译时类型安全并保持辅助函数职责单一；与无
  类型约束的上游原型不同，我们不自动解包节点。调用者显式传入 `.value`。

## 测试分类

- 纯数学/表达式测试（`test/math.test.ts`）
- 真实场景片段（`test/real-world.test.ts`）——收录标准：覆盖新的编译模
  式；几何/上下文节点重构为显式参数
- 多后端与探测测试（`test/backend.test.ts`）
- canary 回归测试（`test/canary.test.ts`）

### three 内部 API 的类型安全治理

- 未类型化 three API 的最小结构接口集中存放在 `src/three-internals.ts`
  （作为我们对 three 内部假设的唯一事实来源）。
- `AssertionNode.setup` 的 builder 类型为
  `NodeBuilderLike & Parameters<Node["getNodeType"]>[0]`，而非 deep import
  three 内部的 NodeBuilder 类——后者跨 minor 版本脆弱，且与外部化策略冲突。

## 依赖策略

- `three` 与 `vitest` / `@vitest/*` 一律 external，绝不内联（早期入口引
  入 vitest 曾导致 vp pack 自动内联 vitest 内部包，已修复）。
- `three >=0.185.0` 与 `vitest >=4.0.0` 声明为 peerDependencies；本库运行
  时直接 import vitest，要求项目直接依赖它。
- 已禁用 `pack.exports` 自动生成：tsdown 的实验性 exports 元数据会重写
  package.json 的 `exports` 映射且丢失 `"types"` 条件，导致 TypeScript 消
  费者在 node16/nodenext/bundler 解析下找不到类型声明。改为手工维护
  exports 映射；仅当未来 tsdown 能保留现有条件时再重新评估。

## 容差语义

- `closeRel` 使用标准相对公式
  `|a - e| <= tolerance * max(|a|, |e|, 1e-12)`。
  选择它而非早期 floor-1 公式（`tolerance * max(1, |e|)`）是因为后者对
  小于 1 的值行为不一致——floor-1 对小输入实际退化为绝对容差，出人意料
  且难以推理。标准公式也是多数测试库做相对比较的惯例。
- `closeAbs` 可用于显式绝对容差。
- CPU 常量可直接传给 `closeAbs` / `closeRel`；内部经 `cpuToNode()` 转换。

## 上游测试快照

- `test/upstream/` 存放从 three.js（`test/unit/addons/tsl/*.tests.js`，MIT
  许可）精选移植的 GPU 原生 TSL 单元测试，已从 QUnit 改写为本库的
  `gpuTest` / `rawComputeTest` API，作为 **API 验证示例**。
- 这些测试是**精选快照，不自动跟随上游**，也不是完整迁移：按需移植用例以
  验证我们需要的 API 路径。每次升级 three 时重新评估，按需更新或移除。
- 源文件在每个测试文件头部注释中标注；相关上游 PR 列在 `test/upstream/README.md`。
