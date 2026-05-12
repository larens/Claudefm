# Local AI Tool Adaptation Design

## 背景

当前 Claudefm 的本地 AI 调用链路是围绕单一 Claude Code CLI 构建的：

- `host/host.js` 通过 `findClaudeBinary()` 只查找 `claude` 可执行文件
- `runClaude()` 直接以 Claude CLI 参数格式发起推理请求
- `extension/sidepanel.js` 的设置项只覆盖 DJ 名称、TTS 音色、保留会话，不支持切换本地 AI 工具
- `README.md` 也默认用户本机安装的是 Claude Code CLI

这导致两个问题：

- 产品能力上，扩展无法适配更多用户已经安装的本地 AI 工具
- 交互上，用户无法在插件设置页明确知道当前正在使用哪个工具，也无法手动切换

本次设计要把“单一 Claude CLI 绑定”升级为“多工具自动检测 + 手动覆盖”的通用本地 AI 运行时。

## 目标

- 支持检测并适配更多本地 AI 工具，包括：
  - `claude code`
  - `claude app`
  - `codex`
  - `gemini cli`
  - `hermes agent`
  - `qwen code`
  - `openclaw`
  - `opencode`
  - `cursor`
  - `qoder`
  - `codebuddy`
  - `github copilot`
- 设置页新增“本地 AI 工具”配置，允许用户查看检测结果并主动切换
- 默认采用“自动检测”模式，从本机已安装工具中推荐一个可用工具
- 允许用户手动选择某个工具覆盖自动推荐结果
- 对具备稳定命令行入口的工具，首版接入统一聊天调用链路
- 对桌面 App / 编辑器插件类工具，首版先支持安装检测、状态展示和占位说明
- 保持现有聊天入口、Native Host 协议和前端使用方式尽量稳定

## 非目标

- 不要求首版让所有列出的工具都完成真实可调用接入
- 不在本次设计中重做推荐 Prompt、音乐业务逻辑或播放逻辑
- 不做“自动把桌面 App 或 IDE 插件桥接为可调用代理”的重型集成
- 不要求不同工具返回完全一致的底层能力，只要求上层输出统一结果结构
- 不在本次范围内增加云端账号登录、OAuth 或远程 API 托管逻辑

## 方案选择

采用“工具注册表 + 检测/执行分层 + 设置页状态展示”的方案。

不采用以下方案：

- 继续在 `host/host.js` 中硬编码 if/else 扩展多个工具
  原因：工具数量多，且后续还会增加，硬编码会让检测、执行、错误处理和 UI 文案快速失控。
- 只做设置页切换，不做真实调用抽象
  原因：用户会以为工具已经真正可用，实际仍绑定 Claude，体验不一致。
- 首版强行接入所有桌面应用和编辑器插件
  原因：不同应用缺少统一稳定的本地调用入口，投入高且风险大，会拖慢 CLI 工具的稳定落地。

## 核心原则

- 工具定义集中管理，不把工具信息散落在 UI 和 Host 的多个角落
- 检测逻辑与执行逻辑分离，避免“检测到了就等于能调用”的错误假设
- 自动模式提供开箱即用体验，手动模式提供确定性控制
- 首版优先保证 CLI 工具链路可用，桌面/编辑器类工具先透明展示边界
- 不可调用时必须明确说明原因，不能默默回退到其他工具而不告知用户

## 工具分层

### 首版真实调用工具

这些工具首版目标是完成真实聊天调用接入，前提是本机存在稳定命令行入口：

- `claude_code`
- `codex`
- `gemini_cli`
- `hermes_agent`
- `qwen_code`
- `openclaw`
- `opencode`

### 首版检测展示工具

这些工具首版只负责检测安装状态、展示和引导文案，不承诺真实聊天调用：

- `claude_app`
- `cursor`
- `qoder`
- `codebuddy`
- `github_copilot`

### 设计要求

- 设置页必须把“可直接调用”和“仅检测到安装”区分展示
- 自动模式只从“可直接调用且当前可用”的工具中选推荐项
- 用户手动选择“仅检测展示工具”时，设置可以保存，但聊天时必须返回明确提示，说明该工具当前未接入直接调用

## 工具注册表设计

新增一个集中注册表，建议放在 `host/ai-tools.js` 或等价位置，作为 Host 与前端共享的逻辑来源。

每个工具定义至少包含以下字段：

- `id`
- `label`
- `category`
- `detectionMode`
- `executionMode`
- `priority`
- `binaryCandidates`
- `appCandidates`
- `envKeys`
- `supportedFeatures`
- `description`
- `installHint`

字段语义：

- `id`
  稳定内部标识，用于存储和协议传输
- `label`
  面向用户显示的名称，例如 `Claude Code`、`Gemini CLI`
- `category`
  工具类别，取值如 `cli`、`desktop_app`、`editor_tool`
- `detectionMode`
  检测方式，取值如 `binary`、`app_bundle`、`path_probe`
- `executionMode`
  执行方式，取值如 `cli`、`unsupported`
- `priority`
  自动推荐优先级，数值越小优先级越高
- `binaryCandidates`
  可能的可执行文件名或常见路径
- `appCandidates`
  桌面应用常见安装路径或 bundle 标识
- `envKeys`
  允许用户通过环境变量显式指定路径的键名
- `supportedFeatures`
  能力标签，例如 `chat`、`json_output`、`schema_output`

## 用户配置模型

新增本地 AI 工具配置，归入现有 `preferences`。

建议字段：

```json
{
  "localAiToolMode": "auto",
  "localAiToolId": "",
  "lastDetectedLocalAiToolId": "",
  "lastResolvedLocalAiToolId": ""
}
```

语义如下：

- `localAiToolMode`
  取值 `auto` 或 `manual`
- `localAiToolId`
  手动模式下用户指定的工具 ID；自动模式下可以为空
- `lastDetectedLocalAiToolId`
  最近一次自动检测得到的推荐工具
- `lastResolvedLocalAiToolId`
  当前实际生效的工具，供 UI 展示

兼容策略：

- 老用户没有这些字段时，默认按 `auto` 处理
- 未配置时不应打断现有使用，系统会尝试自动检测

## 自动检测设计

### 检测时机

以下时机触发检测：

- Side Panel 初始化时
- 设置面板打开时
- 用户点击刷新工具状态时
- Host 收到聊天请求且缓存检测结果过旧时

### 检测输出

Host 需要返回结构化结果，至少包括：

```json
{
  "tools": [
    {
      "id": "claude_code",
      "label": "Claude Code",
      "category": "cli",
      "installed": true,
      "callable": true,
      "executionMode": "cli",
      "statusText": "已安装，可直接调用",
      "resolvedPath": "/opt/homebrew/bin/claude"
    }
  ],
  "recommendedToolId": "claude_code",
  "resolvedToolId": "claude_code",
  "mode": "auto"
}
```

其中：

- `installed`
  表示是否检测到安装迹象
- `callable`
  表示是否可被当前 Host 直接调用
- `resolvedPath`
  只在明确检测到路径时返回
- `recommendedToolId`
  自动模式下按优先级推荐的工具
- `resolvedToolId`
  当前配置下最终实际生效的工具

### 推荐规则

自动模式下按以下规则选出推荐工具：

1. 仅考虑 `callable === true` 的工具
2. 按注册表 `priority` 排序
3. 若有环境变量显式指定的工具路径且可用，优先于纯 PATH 扫描结果
4. 若没有任何可调用工具，返回空值并附带修复提示

### 检测缓存

- 检测结果可以短暂缓存，避免每次打开设置都完整扫描
- 建议缓存周期为当前 Host 进程存活期内可复用，或基于时间戳做轻量过期
- 用户手动刷新时必须绕过缓存

## 手动覆盖设计

### 行为规则

- 用户将模式切到 `manual` 后，系统只尝试使用用户选定工具
- 若该工具已安装但不可调用，聊天时直接报出明确错误，不自动偷偷回退
- 若该工具完全未安装，设置页显示错误状态，聊天时提示安装
- 用户从 `manual` 切回 `auto` 后，系统重新按推荐规则解析实际工具

### 保持可预期性

手动模式的核心目标是“确定性”，因此：

- 不能因为自动推荐到别的可用工具，就忽略用户手选项
- 可以展示“系统推荐使用 X”，但不能在用户不知情时改用 X

## 执行层设计

### 通用运行入口

当前 `findClaudeBinary()` 和 `runClaude()` 需要抽象成通用入口，建议拆成：

- `detectLocalAiTools()`
- `resolveLocalAiTool(preferences, detectionResult)`
- `runWithLocalAiTool(tool, prompt, schema)`
- `normalizeLocalAiResponse(tool, rawOutput)`

### 执行模式

首版支持两类执行模式：

- `cli`
  通过 `spawn` 调起命令行工具
- `unsupported`
  返回结构化错误，说明该工具仅完成检测展示，尚未接入直接调用

### CLI 工具适配层

每个 CLI 工具需要定义：

- 命令路径解析方式
- Prompt 入参格式
- JSON 输出约束方式
- 退出码与 stderr 错误解释方式

不是所有工具都原生支持和 Claude 完全相同的 `json-schema` 参数，因此适配层必须允许：

- 原生 schema 输出
- 原生 JSON 输出但无 schema
- 纯文本输出后由 Host 做二次解析

首版要求最终都归一到现有上层结果结构：

```json
{
  "say": "string",
  "reason": "string",
  "play": [],
  "segue": "string",
  "memory": []
}
```

### 归一化要求

- 上层 `background.js` 和 `sidepanel.js` 不感知底层具体工具差异
- 无论底层是哪种 CLI，最终都返回统一结构给扩展
- 若工具返回不满足结构要求，Host 负责报错或兜底修正，不把半结构化结果直接透传给 UI

## 工具适配矩阵

### Claude Code

- 检测：现有 `claude` 检测链路保留并提升为注册表配置
- 执行：沿用当前 CLI 调用方式
- 优先级：最高，作为现有稳定路径

### Codex / Gemini CLI / Hermes Agent / Qwen Code / OpenClaw / OpenCode

- 检测：优先 `command -v` + 常见绝对路径候选
- 执行：按各自命令格式封装为 CLI 适配器
- 风险：各工具 JSON 输出能力不同，需要独立适配和降级策略

### Claude App / Cursor / Qoder / CodeBuddy / GitHub Copilot

- 检测：按应用路径、bundle、可执行文件或已知安装痕迹判断
- 执行：首版统一标记为 `unsupported`
- UI：明确展示“已检测到安装，暂不支持直接调用”

## Native Host 协议扩展

需要新增以下消息类型：

- `detectLocalAiTools`
- `getResolvedLocalAiTool`
- `chat` 使用新的解析结果执行，但消息类型本身可保持不变

返回值要包含工具上下文，便于前端展示，例如：

- 当前模式
- 当前选择工具
- 当前实际生效工具
- 当前工具是否可调用
- 失败原因

这样设置页和聊天错误提示都能保持一致，不需要在前端重复推断。

## 设置页设计

### 新增配置项

在现有设置面板中新增“本地 AI 工具”区域，至少包含：

- 模式切换：`自动检测` / `手动选择`
- 工具选择下拉框
- 当前状态文本
- 刷新按钮
- 辅助说明文案

### UI 展示要求

- 工具列表显示名称和状态，例如：
  - `Claude Code · 已安装，可直接调用`
  - `Cursor · 已安装，仅检测展示`
  - `Gemini CLI · 未安装`
- 当模式为 `auto` 时，下拉框可以只读或允许浏览但不生效，实际以推荐项为准
- 当模式为 `manual` 时，下拉框生效
- 必须展示“当前实际使用：X”
- 若用户手选的工具不可调用，必须显示风险提示，不得只显示静默失败

### 交互反馈

- 切换模式后立即保存到 `chrome.storage.local`
- 切换手动工具后立即请求 Host 验证
- 若验证失败，保留用户选择，但 UI 告知该工具当前不可用
- 设置面板打开时自动拉取最新检测结果

## Background 与 Side Panel 改动边界

### `background.js`

职责：

- 继续作为 UI 与 Native Host 之间的桥接层
- 负责把设置页请求转发给 Host
- 在聊天结果或错误中附带当前工具上下文

不应承担：

- 工具检测细节
- 工具优先级判断
- 各种 CLI 参数拼装

### `sidepanel.js`

职责：

- 渲染工具设置区域
- 保存模式和手选工具到 `preferences`
- 展示当前解析结果、状态和错误提示

不应承担：

- 本地文件系统或 PATH 扫描
- 各工具能力判断
- 底层执行策略推断

## 错误处理

### 无任何可用 CLI 工具

- 自动模式下返回“未发现可直接调用的本地 AI 工具”
- 设置页展示安装提示
- 聊天时返回结构化错误，不再假装已有回复

### 手动选择了仅检测展示工具

- 保存成功
- 设置页明确显示“当前工具尚未接入直接调用”
- 发起聊天时返回明确提示，而不是自动切回 Claude

### 选定 CLI 工具启动失败

- 返回工具名、命令路径和原始错误摘要
- 如果是自动模式，可选择在结果中提示“可尝试切换为其他已安装工具”，但不应静默替换本次请求执行器

### 工具输出格式不合法

- Host 负责标记为“输出解析失败”
- 错误消息中指出具体工具
- 不向前端返回不完整的半结构化业务对象

## 文档与安装提示

需要更新 `README.md` 与 `README.en.md`，说明：

- 当前支持检测的本地 AI 工具列表
- 当前支持真实调用的工具列表
- 如何通过环境变量显式指定工具路径
- 当设置页显示“仅检测展示”时意味着什么

如果某些 CLI 工具支持路径环境变量覆盖，建议约定为工具级变量，例如：

- `CLAUDE_BIN`
- `CODEX_BIN`
- `GEMINI_BIN`
- `QWEN_CODE_BIN`

具体命名可在实现阶段统一收敛，但原则上应保持可读和可预期。

## 风险

- 不同 CLI 工具的输出能力不一致，适配层复杂度高于单一 Claude 路径
- 若注册表与 UI 文案不同步，用户会看到错误状态或误导性描述
- 若自动模式推荐逻辑不透明，用户可能不理解为什么“明明装了 Cursor，却实际用的是 Claude Code”
- 桌面 App 和编辑器工具首版只检测不调用，若 UI 边界写得不清楚，会引发支持预期偏差

## 验证方案

- 在只安装 Claude Code 的机器上验证自动检测仍能正常聊天
- 在同时安装多个 CLI 工具的机器上验证自动模式按优先级选择
- 在手动模式下切换到另一个可调用 CLI，验证聊天确实走新工具
- 在手动模式下选择 `Cursor` 这类仅检测展示工具，验证设置保存成功但聊天给出明确错误
- 在没有任何可调用 CLI 的机器上验证设置页和聊天提示都准确
- 验证老用户升级后未配置新字段时不会阻断原有使用

## 验收标准

- 设置页新增“本地 AI 工具”配置，支持 `自动检测` 与 `手动选择`
- 系统能检测用户本机列出的本地 AI 工具安装状态
- 自动模式能从可调用工具中选出推荐项
- 手动模式能强制使用用户指定工具，且不静默回退
- 首版 CLI 工具具备统一聊天调用能力
- 首版桌面 App / 编辑器工具能展示安装状态和“暂不支持直接调用”说明
- 上层聊天与推荐业务结构保持兼容，不需要前端针对每个工具做分支处理

## 实施顺序

建议按以下顺序实现：

1. 抽离 Host 工具注册表与检测逻辑
2. 抽离通用执行入口，先保留 Claude Code 路径可用
3. 接入其他 CLI 工具适配器
4. 扩展 Native Host 协议
5. 在设置页补充模式切换、工具列表和状态展示
6. 更新 README 与安装说明

这个顺序能先稳住 Host 抽象，再逐步把 UI 接上，减少前后端反复改协议的成本。
