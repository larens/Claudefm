#!/usr/bin/env node
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function sanitizeMarkdownOutput(text, requiredHeading) {
  let raw = String(text || "").trim();
  if (!raw) return "";

  const fenced = raw.match(/```(?:markdown|md)?\s*\n([\s\S]*?)\n```/i);
  if (fenced && fenced[1]) raw = String(fenced[1]).trim();

  const idx = raw.indexOf(requiredHeading);
  if (idx >= 0) raw = raw.slice(idx).trim();

  const lines = raw
    .split("\n")
    .filter((l) => !String(l).trim().startsWith("```"))
    .map((l) => String(l).replace(/\s+$/g, ""));

  return lines.join("\n").trim();
}

function readNativeMessageStream(onMessage) {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const len = buffer.readUInt32LE(0);
      if (buffer.length < 4 + len) return;
      const payload = buffer.slice(4, 4 + len);
      buffer = buffer.slice(4 + len);
      try {
        const obj = JSON.parse(payload.toString("utf8"));
        onMessage(obj);
      } catch {}
    }
  });
}

function sendNativeMessage(obj) {
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildSchema() {
  return {
    type: "object",
    properties: {
      say: { type: "string" },
      reason: { type: "string" },
      play: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            artist: { type: "string" },
            album: { type: "string" },
            provider: { type: "string" },
            query: { type: "string" },
            streamUrl: { type: "string" }
          },
          required: ["name", "artist"]
        }
      },
      segue: { type: "string" },
      memory: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            text: { type: "string" }
          },
          required: ["type", "text"]
        }
      }
    },
    required: ["say", "play", "memory"]
  };
}

function applyMemory(profileSummary, memory) {
  const lines = (profileSummary || "").split("\n").filter(Boolean);
  const existing = new Set(lines);
  for (const m of memory || []) {
    const type = m && m.type ? String(m.type) : "taste";
    const text = m && m.text ? String(m.text) : "";
    const line = `- [${type}] ${text}`.trim();
    if (!text) continue;
    if (!existing.has(line)) {
      existing.add(line);
      lines.push(line);
    }
  }
  return lines.slice(-200).join("\n");
}

function buildPrompt(input) {
  const djRaw = input.djName ?? "Claudio";
  let dj = String(djRaw).replace(/\r|\n/g, " ").trim().slice(0, 24);
  if (!dj) dj = "Claudio";
  const provider = input.provider || "qq";
  const profile = input.profileSummary || "";
  const scene = input.scene || "";
  const force = Boolean(input.forceProfileRefresh);

  const instructions = [
    `你是 Claudiofm 的 DJ ${dj}。回复必须是中文。`,
    "你的任务：根据用户消息、画像摘要、场景信息，给出电台式回应，并推荐 5-10 首适合当前场景的歌曲。",
    `当前音源来源偏好：${provider}。`,
    "必须输出 JSON，字段遵循给定 schema。",
    "play 数组长度必须在 5 到 10 之间。",
    "每首歌只输出 name/artist；album/query/provider 可选。",
    "memory 用于写回画像偏好，尽量输出 1-3 条可执行的偏好更新。",
    force ? "这是一次画像自检更新，请务必输出 2-3 条高质量 memory 用于纠偏与巩固偏好。" : ""
  ].filter(Boolean);

  return [
    instructions.join("\n"),
    "",
    "【画像摘要】",
    profile || "(空)",
    "",
    "【场景信息】",
    scene || "(空)",
    "",
    "【用户消息】",
    input.text || ""
  ].join("\n");
}

function runClaude(prompt, schema) {
  return new Promise((resolve) => {
    const getClaudePath = () => {
      const { execSync } = require("child_process");
      try {
        return execSync("zsh -l -c 'which claude'", { encoding: "utf8" }).trim();
      } catch {
        return "claude";
      }
    };

    const claudePath = "/Users/lairuisi/workspace/.npm-global/bin/claude";
    const args = [
      "--bare",
      "-p",
      prompt,
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(schema)
    ];
    const env = {
      ...process.env,
      PATH: "/Users/lairuisi/workspace/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
      HOME: "/Users/lairuisi"
    };
    const child = spawn(claudePath, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      err += d.toString("utf8");
    });
    child.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: err || `claude exited ${code}` });
        return;
      }
      const payload = safeJsonParse(out);
      const structured = payload && payload.structured_output ? payload.structured_output : null;
      if (!structured) {
        resolve({ ok: false, error: "claude output missing structured_output" });
        return;
      }
      resolve({ ok: true, result: structured });
    });
  });
}

async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error(`http ${resp.status}`);
  return await resp.json();
}

function weatherCodeToZh(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return "";
  const mapping = {
    0: "晴",
    1: "大部晴朗",
    2: "多云",
    3: "阴",
    45: "雾",
    48: "雾凇",
    51: "毛毛雨",
    53: "毛毛雨",
    55: "毛毛雨",
    56: "冻毛毛雨",
    57: "冻毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "冻雨",
    67: "冻雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "雪粒",
    80: "阵雨",
    81: "阵雨",
    82: "强阵雨",
    85: "阵雪",
    86: "强阵雪",
    95: "雷暴",
    96: "雷暴伴冰雹",
    99: "强雷暴伴冰雹"
  };
  return mapping[String(c)] || mapping[c] || "";
}

function getTimeSegment(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "早上";
  if (h >= 11 && h < 14) return "中午";
  if (h >= 14 && h < 18) return "下午";
  if (h >= 18 && h < 23) return "晚上";
  return "深夜";
}

function readMusicMemoryFile(maxChars = 6000) {
  try {
    const filePath = path.join(os.homedir(), "Documents", "Claudiofm", "music.md");
    if (!fs.existsSync(filePath)) return "";
    const content = String(fs.readFileSync(filePath, "utf8") || "").trim();
    if (!content) return "";
    return content.slice(-maxChars);
  } catch {
    return "";
  }
}

async function getLocationName(latitude, longitude) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`;
    const data = await fetchJson(url, { headers: { "User-Agent": "Claudiofm/0.0.1" } });
    const address = data && data.address ? data.address : null;
    if (address && typeof address === "object") {
      for (const key of ["city", "town", "village", "municipality", "county", "state"]) {
        const v = address[key];
        if (v) return String(v);
      }
    }
    return data && data.name ? String(data.name) : "";
  } catch {
    return "";
  }
}

async function getWeather(latitude, longitude) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}&current_weather=true&timezone=auto`;
    const data = await fetchJson(url, { headers: { "User-Agent": "Claudiofm/0.0.1" } });
    const cw = data && data.current_weather ? data.current_weather : null;
    if (!cw || typeof cw !== "object") return null;
    return { temperature: cw.temperature, windspeed: cw.windspeed, weathercode: cw.weathercode };
  } catch {
    return null;
  }
}

async function buildWelcomeScene(latitude, longitude, profileSummary) {
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const pieces = [`今天是 ${dateStr}，${getTimeSegment(now)}`];

  const lat = Number(latitude);
  const lon = Number(longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  let location = "";
  let weather = null;
  if (hasCoords) {
    location = await getLocationName(lat, lon);
    weather = await getWeather(lat, lon);
  }

  if (location) pieces.push(`你在 ${location}`);
  if (weather) {
    const desc = weatherCodeToZh(weather.weathercode);
    const t = weather.temperature;
    const w = weather.windspeed;
    let wx = "天气信息";
    if (desc && Number.isFinite(Number(t))) wx = `${desc}，${t}℃`;
    else if (desc) wx = desc;
    else if (Number.isFinite(Number(t))) wx = `${t}℃`;
    if (Number.isFinite(Number(w))) wx = `${wx}，风速 ${w}`;
    pieces.push(`当前${wx}`);
  }

  const memFile = readMusicMemoryFile();
  const lines = [];
  lines.push(pieces.join("；"));
  lines.push("");
  lines.push("【历史记忆（profileSummary）】");
  lines.push(String(profileSummary || "").trim() || "(空)");
  if (memFile) {
    lines.push("");
    lines.push("【历史记忆文件（music.md 摘要）】");
    lines.push(memFile);
  }
  return lines.join("\n").trim();
}

function appendDailyConversation(input) {
  const folder = path.join(os.homedir(), "Documents", "Claudiofm");
  fs.mkdirSync(folder, { recursive: true });
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const dateKey = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const filePath = path.join(folder, `${dateKey}_music_memory.md`);

  const kind = input && input.kind ? String(input.kind) : "chat";
  const userText = input && input.userText ? String(input.userText).trim() : "";
  const result = input && input.result && typeof input.result === "object" ? input.result : {};
  const say = result.say ? String(result.say).trim() : "";
  const reason = result.reason ? String(result.reason).trim() : "";
  const assistantText = [say, reason].filter(Boolean).join("\n\n") || "(空)";

  const tracks = [];
  if (Array.isArray(result.play)) {
    for (const t of result.play) {
      if (!t || typeof t !== "object") continue;
      const name = t.name ? String(t.name).trim() : "";
      const artist = t.artist ? String(t.artist).trim() : "";
      const title = [name, artist].filter(Boolean).join(" - ").trim();
      tracks.push(title || "未知歌曲");
    }
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# ${dateKey} Music Memory\n\n`, "utf8");
  }

  const lines = [];
  lines.push(`## ${timeStr}`);
  lines.push(`- type: ${kind}`);
  if (userText) {
    lines.push("", "### user", userText);
  }
  lines.push("", "### assistant", assistantText);
  if (tracks.length) {
    lines.push("", "### playlist");
    tracks.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  }
  lines.push("");

  fs.appendFileSync(filePath, lines.join("\n"), "utf8");
  return { ok: true, path: filePath };
}

function readMemoryFile() {
  const filePath = path.join(os.homedir(), "Documents", "Claudiofm", "music.md");
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `file not found: ${filePath}` };
  }
  const content = String(fs.readFileSync(filePath, "utf8") || "");
  const maxChars = 20000;
  const sliced = content.length > maxChars ? content.slice(-maxChars) : content;
  return { ok: true, path: filePath, content: sliced };
}

function exportMemoryMd(input) {
  const djRaw = input && input.djName ? String(input.djName) : "Claudio";
  const dj = djRaw.replace(/\r|\n/g, " ").trim().slice(0, 24) || "Claudio";
  const summary = input && input.profileSummary ? String(input.profileSummary).trim() : "";
  const folder = path.join(os.homedir(), "Documents", "Claudiofm");
  const filePath = path.join(folder, "music.md");
  fs.mkdirSync(folder, { recursive: true });

  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

  const lines = [];
  lines.push("# Claudiofm Memory", "", `- DJ: ${dj}`, `- Exported: ${stamp}`, "", "## Profile Summary", "");
  if (summary) {
    for (const line of summary.split("\n")) lines.push(`> ${line}`);
  } else {
    lines.push("> (空)");
  }
  lines.push("");
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  return { ok: true, path: filePath };
}

function optimizeMemoryFile(input) {
  const djRaw = input && input.djName ? String(input.djName) : "Claudio";
  const dj = djRaw.replace(/\r|\n/g, " ").trim().slice(0, 24) || "Claudio";
  const summary = input && input.profileSummary ? String(input.profileSummary).trim() : "";
  const templatePath = input && input.templatePath ? String(input.templatePath) : "";
  if (!templatePath || !fs.existsSync(templatePath)) {
    return Promise.resolve({ ok: false, error: `template not found: ${templatePath}` });
  }

  const folder = path.join(os.homedir(), "Documents", "Claudiofm");
  const filePath = path.join(folder, "music.md");
  fs.mkdirSync(folder, { recursive: true });

  let template = "";
  try {
    template = fs.readFileSync(templatePath, "utf8");
  } catch (e) {
    const message = e && e.message ? String(e.message) : String(e);
    return Promise.resolve({ ok: false, error: `read template failed: ${message}` });
  }

  let existing = "";
  try {
    if (fs.existsSync(filePath)) existing = fs.readFileSync(filePath, "utf8");
  } catch {
    existing = "";
  }

  const prompt = [
    "你是一个音乐偏好画像整理器。请把“现有记忆”整理为严格遵循“模板”的 Markdown 文档。",
    "要求：",
    "1) 输出必须是 Markdown，且结构与标题层级必须与模板一致。",
    "2) 充分利用现有记忆信息补全模板中能补全的字段；无法确定的保持为空或占位符。",
    "3) 去重、归类、措辞简洁；不要输出与模板无关的说明文字。",
    "4) 不要用任何代码块（不要输出 ```markdown 或 ```）。",
    `4) DJ 名称为：${dj}`,
    "",
    "【模板】",
    template,
    "",
    "【现有记忆】",
    (existing || "").trim() || "(空)",
    "",
    "【profileSummary】",
    summary || "(空)",
    "",
    "现在开始输出整理后的 Markdown："
  ].join("\n");

  const claudePath = "/Users/lairuisi/workspace/.npm-global/bin/claude";
  const args = ["--bare", "-p", prompt];
  const env = {
    ...process.env,
    PATH: "/Users/lairuisi/workspace/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: "/Users/lairuisi"
  };

  return new Promise((resolve) => {
    const child = spawn(claudePath, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      err += d.toString("utf8");
    });
    child.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: err || `claude exited ${code}` });
        return;
      }
      const md = sanitizeMarkdownOutput(out || "", "# 用户音乐记忆画像档案");
      if (!md) {
        resolve({ ok: false, error: "empty output from claude" });
        return;
      }
      if (!md.startsWith("# 用户音乐记忆画像档案")) {
        resolve({ ok: false, error: "output does not follow template heading" });
        return;
      }
      try {
        fs.writeFileSync(filePath, md + "\n", "utf8");
        resolve({ ok: true, path: filePath });
      } catch (e) {
        const message = e && e.message ? String(e.message) : String(e);
        resolve({ ok: false, error: `write failed: ${message}` });
      }
    });
  });
}

readNativeMessageStream(async (msg) => {
  try {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "exportMemoryMd") {
      sendNativeMessage(exportMemoryMd(msg));
      return;
    }
    if (msg.type === "optimizeMemoryFile") {
      const res = await optimizeMemoryFile(msg);
      sendNativeMessage(res);
      return;
    }
    if (msg.type === "appendDailyConversation") {
      sendNativeMessage(appendDailyConversation(msg));
      return;
    }
    if (msg.type === "readMemoryFile") {
      sendNativeMessage(readMemoryFile());
      return;
    }
    if (msg.type === "welcome") {
      const schema = buildSchema();
      const profileSummary = msg.profileSummary ? String(msg.profileSummary) : "";
      const djRaw = msg.djName ?? "Claudio";
      const dj = String(djRaw).replace(/\r|\n/g, " ").trim().slice(0, 24) || "Claudio";
      const provider = msg.provider || "paojiao";

      const scene = await buildWelcomeScene(msg.latitude, msg.longitude, profileSummary);
      const prompt = buildPrompt({
        provider,
        profileSummary,
        scene,
        djName: dj,
        forceProfileRefresh: false,
        text: "请用电台 DJ 的口吻对我说一句开场欢迎语，并根据时间/地点/天气/历史记忆推荐 5-10 首适合现在的歌。"
      });

      const resp = await runClaude(prompt, schema);
      if (!resp.ok) {
        sendNativeMessage(resp);
        return;
      }
      const nextProfile = applyMemory(profileSummary, resp.result.memory || []);
      sendNativeMessage({ ok: true, result: resp.result, profileSummary: nextProfile });
      return;
    }
    if (msg.type !== "chat") {
      sendNativeMessage({ ok: false, error: "unknown message type" });
      return;
    }

    const schema = buildSchema();
    const prompt = buildPrompt(msg);
    const resp = await runClaude(prompt, schema);
    if (!resp.ok) {
      sendNativeMessage(resp);
      return;
    }

    const nextProfile = applyMemory(msg.profileSummary || "", resp.result.memory || []);
    sendNativeMessage({ ok: true, result: resp.result, profileSummary: nextProfile });
  } catch (err) {
    sendNativeMessage({ ok: false, error: String(err) });
  }
});
