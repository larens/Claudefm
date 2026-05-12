# Claudefm Music Assistant

中文 · [English](./README.en.md)

Claudefm 是一个 Chromium Side Panel 扩展，把“DJ 对话 + 歌单推荐 + 自动播放”做成一个本地优先的音乐助手。

- 对话与推荐：通过 Native Messaging 调用本机 Claude Code CLI
- 本地数据：Host 落盘到本机目录，扩展状态保存在 `chrome.storage.local`

## 仓库结构

- `extension/`：Chrome 扩展与 Side Panel UI
- `host/`：Native Messaging Host、安装脚本、平台配置模板
- `docs/`：模板与设计文档

## 功能概览

- 即时对话反馈，支持按语义确认是否真的要推荐歌单
- DJ 推荐语编辑、推送并播放（可配置自动播放或手动确认）
- 点赞/踩闭环，影响后续推荐与过滤
- 历史歌单读取与详情查看
- 本地缓存歌曲与封面
- TTS 音色选择与歌词情绪插播
- Soul 面板读取本地音乐记忆文件
- 本地 AI 工具自动检测与调用（Claude Code 等）
- 后台播放：Side Panel 关闭后音乐继续播放

## 架构

```text
┌──────────────┐      Native Messaging      ┌─────────────────────────────┐
│ Side Panel UI│  ───────────────────────▶ │ Claudefm Host              │
│ extension/   │                           │ host.py / host.cjs          │
└──────┬───────┘                           └───────────┬─────────────────┘
       │                                              │
       │ chrome.runtime.sendMessage / port            │ claude --bare
       │                                              │ + local files/cache
┌──────▼────────────────────┐                          │
│ Background Service Worker │                          │
│ extension/background.js   │                          │
└──────────┬─────────────────┘                          │
           │                                            │
           │ Provider Tab / Fetch                        │
           ▼                                            ▼
      https://music.pjmp3.com/*                  Claudefm data dir
```

## 快速开始

### 前置条件

- Chrome / Edge / Brave / Arc / Chromium 等 Chromium 浏览器
- Node.js `>=18`（推荐）
- Python 3（可选，Node.js 不可用时回退使用）
- Claude Code CLI 可执行，命令为 `claude`

### 1. 加载扩展

1. 打开 `chrome://extensions`
2. 开启开发者模式
3. 选择 `Load unpacked`
4. 选择仓库中的 `extension/`
5. 复制扩展 ID

### 2. 配置安装文件

可以直接命令行传参：

```bash
node host/install.mjs --extensionId <YOUR_EXTENSION_ID>
```

高级用法：

```bash
node host/install.mjs --config host/install-linux.json
node host/install.mjs --extensionId <YOUR_EXTENSION_ID> --dataDir /absolute/path/to/data
```

也可以按平台编辑对应配置文件：

- macOS：`host/install-macos.json`
- Linux：`host/install-linux.json`
- Windows：`host/install-windows.json`

最小配置示例：

```json
{
  "extensionId": "YOUR_EXTENSION_ID"
}
```

可选字段：

```json
{
  "extensionId": "YOUR_EXTENSION_ID",
  "dataDir": "/absolute/path/to/Claudefm-data",
  "hostAbsolutePath": "/absolute/path/to/claudefm-host.sh"
}
```

### 3. 安装 Native Host 并生成初始化文件

```bash
cd host
node install.mjs
```

安装脚本会同时完成这些事情：

- 安装 Native Messaging manifest
- 写入运行期配置快照 `host/runtime-config.json`
- 创建本地数据目录
- 生成 `music.md`
- 生成 `list.md`
- 创建 `cache/`、`cache/tracks/`、`cache/covers/`

### 4. 打开侧栏

点击扩展图标，打开 Side Panel → Claudefm。

## 设置

点击侧栏右上角齿轮图标打开设置面板：

| 设置项 | 说明 |
|--------|------|
| DJ 名称 | 自定义 DJ 角色名称（最多 8 字） |
| 口播音色 | 选择 TTS 语音音色 |
| 收起侧边栏保留会话 | 关闭侧栏后是否保留对话历史 |
| DJ 推荐自动播放 | 开启时 DJ 推荐直接播放；关闭时显示确认按钮，手动点击后才播放 |
| 本地 AI 工具 | 自动检测或手动选择本地 AI CLI 工具 |

## 默认本地数据目录

- macOS：`~/Documents/Claudefm`
- Linux：`${XDG_DATA_HOME:-~/.local/share}/Claudefm`
- Windows：`%APPDATA%\Claudefm`

目录内容通常包括：

- `music.md`：用户音乐记忆画像
- `list.md`：历史歌单记录
- `cache/`：歌曲与封面缓存

## 平台说明

### macOS

- 安装配置：`host/install-macos.json`
- 日志：`~/Library/Logs/ClaudefmHost.log`
- Native Messaging Hosts：位于各 Chromium 浏览器的 `Library/Application Support/.../NativeMessagingHosts`

### Linux

- 安装配置：`host/install-linux.json`
- 日志：`${XDG_STATE_HOME:-~/.local/state}/Claudefm/ClaudefmHost.log`
- Native Messaging Hosts：位于各浏览器的 `~/.config/.../NativeMessagingHosts`

### Windows

- 安装配置：`host/install-windows.json`
- 日志：`%TEMP%\ClaudefmHost.log`
- Native Messaging：安装脚本会写入当前用户注册表 `HKCU\Software\...\NativeMessagingHosts`

## Troubleshooting

- `forbidden` / `Not allowed`
- 确认配置文件中的 `extensionId` 与 `chrome://extensions` 中显示的一致
- 重新执行 `node host/install.mjs`
- 完全退出并重启浏览器

- 找不到 `claude`
- 确认 Claude Code CLI 已安装，且 `claude` 在 `PATH` 中
- 或设置环境变量 `CLAUDE_BIN` 指向可执行文件绝对路径

- 想自定义数据目录
- 在安装配置里设置 `dataDir`
- 或执行安装命令时传 `--dataDir`

- 删除过本地文件后如何恢复
- 重新执行 `node host/install.mjs`
- Host 运行时也会对缺失的核心文件做兜底创建

## License

[MIT](./LICENSE)
