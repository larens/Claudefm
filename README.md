# Claudiofm Chrome Extension

中文 · [English](./README.en.md)

Claudiofm 的 Chrome 侧栏插件版本（MV3 Side Panel）：把“DJ 对话 + 歌单推荐 + 自动播放”做成一个本地优先的 Side Panel。

- 对话/推荐：通过 Native Messaging 调用本机 Claude Code CLI（`claude --bare ...`）
- 音源解析：受控 Web Provider（当前使用 `https://music.pjmp3.com/*`）
- 数据与偏好：本地落盘 + `chrome.storage.local`（云同步计划中）

## 目录

- `extension/`：Chrome 扩展（Side Panel UI + background service worker）
- `host/`：Native Messaging Host（macOS，优先 Python，回退 Node）
- `docs/`：开发资料与模板

## 功能特性（当前版本）

- 对话区即时反馈：发送后立即展示“正在思考…”，收到回复后自动替换
- 语义推荐策略：不是每次都推荐歌单；模型会先确认“是否需要推荐”
- DJ 推送新歌单：推荐歌单返回后，支持编辑 DJ 推荐语，再一键“推送并播放”
- 新会话首个歌单：在空队列状态下，DJ 推荐歌单会直接进入队列并自动开始播放
- 点赞/踩闭环：在当前歌单与历史列表中可标记 like/dislike，并影响后续推荐与过滤
- 历史与详情：读取 `~/Documents/Claudiofm/list.md`（最近 7 天），支持封面缓存命中渲染
- 本地缓存：Host 会把歌曲与封面缓存到 `~/Documents/Claudiofm/cache/`，优先命中提升速度
- TTS 与插播：支持选择朗读音色；可生成“歌词情绪解读”插播段落
- Soul 面板与场景：读取本地记忆文件，必要时请求定位辅助场景推荐

## 工作原理（架构）

```
┌──────────────┐      Native Messaging      ┌────────────────────────┐
│ Side Panel UI │  ───────────────────────▶ │  Claudiofm Host (macOS) │
│ (extension/)  │                           │  host.py / host.cjs     │
└──────┬───────┘                           └───────────┬────────────┘
       │                                              │
       │  chrome.runtime.sendMessage / port            │  claude --bare
       │                                              │  + 本地缓存/文件
┌──────▼────────────────────┐                          │
│ Background Service Worker  │                          │
│ (extension/background.js)  │                          │
└──────────┬─────────────────┘                          │
           │                                            │
           │ Provider Tab / Fetch                        │
           ▼                                            ▼
      https://music.pjmp3.com/*                    ~/Documents/Claudiofm/
```

## 快速开始（macOS）

### 前置条件

- Chrome/Arc（支持 Side Panel 的 Chromium 内核浏览器）
- Node.js ≥ 18（用于安装 Host；运行时可选）
- Python 3（可选；存在则优先使用 `host.py`）
- Claude Code CLI 可用（命令 `claude` 在 PATH 中；或通过环境变量 `CLAUDE_BIN` 指定）

### 1) 加载扩展

1. 打开 `chrome://extensions`
2. 开启开发者模式
3. Load unpacked 选择本仓库的 `extension/`
4. 复制扩展 ID（extensionId）

### 2) 配置并安装 Native Host

编辑 `host/install-macos.json`：

```json
{
  "extensionId": "你的扩展ID（chrome-extension://...）"
}
```

安装（会写入浏览器的 `NativeMessagingHosts` 目录；默认 Host 入口为 `host/claudiofm-host.sh`）：

```bash
cd host
node install-macos.mjs
```

### 3) 打开侧栏

点击扩展图标，打开 Side panel → Claudiofm。

## 常见问题（Troubleshooting）

- Host 未授权/forbidden：
  - 确认 `host/install-macos.json` 的 `extensionId` 与 `chrome://extensions` 一致
  - 重新执行 `node host/install-macos.mjs`
  - 完全退出并重启浏览器
- 找不到 `claude`：
  - 确认 Claude Code CLI 已安装且命令可用
  - 或设置环境变量 `CLAUDE_BIN` 指向 claude 可执行文件路径
- Host 日志：
  - `~/Library/Logs/ClaudiofmHost.log`

## 发布历史（摘要）

近期主线变更（按提交摘要归纳）：

- `a9ed009`：历史封面缓存命中渲染 + 点赞/踩 UI & 推荐过滤联动
- `45d2f2d`：修复非音乐对话也能正常返回大模型回复
- `c44e82d`：优先使用模型 TTS，失败回退浏览器 TTS
- `2ce151a`：音色选择与歌词插播（lyric interlude）
- `c85b03a`：历史歌单导入与 Soul 面板
- `f36d301`：修复 macOS Host 安装路径与 Claude CLI 超时处理

## License

尚未在仓库中声明许可证（如需开源发布，建议补充 LICENSE 并在 README 中明确）。
