# claudiofm-chrome-extension

Claudiofm 的 Chrome 侧栏插件版本（MV3 Side Panel），本地优先：

- 推荐/对话：本地 Claude Code（`claude --bare -p ...`）
- 音源：官方 Web Provider（v0 先提供受控页面骨架 + demo 音源兜底，后续补 QQ 解析与歌单导入）
- 数据：本地保存，云同步二期

## 目录

- `extension/` Chrome 扩展
- `host/` Native Messaging Host（macOS）

## 快速开始（开发态）

### 1) 安装 Host 依赖

```bash
cd host
npm install
```

### 2) 安装 Native Host（macOS）

1. 先加载扩展拿到 extensionId（见下一节），再填写 `host/install-macos.json`：
   - `extensionId`: `chrome://extensions` 里显示的扩展 ID
   - `hostAbsolutePath`: 本机 `host/host.js` 的绝对路径
2. 执行安装脚本（会写入 Chrome 的 NativeMessagingHosts 目录）：

```bash
cd host
node install-macos.mjs
```

### 3) 加载扩展

1. 打开 `chrome://extensions`
2. 打开开发者模式
3. Load unpacked 选择 `extension/`
4. 复制扩展 ID，回到上一步填写 `host/install-macos.json`

### 4) 打开侧栏

点击扩展图标，选择 Side panel 打开 Claudiofm。
