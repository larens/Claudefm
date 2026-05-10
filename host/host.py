#!/usr/bin/env python3
import sys
import os
import json
import struct
import subprocess
import re
import datetime
import urllib.request
import urllib.parse
import shutil

def resolve_template_path(input_path):
    provided = str(input_path or "")
    if provided and os.path.isfile(provided):
        return provided
    base = os.path.dirname(os.path.abspath(__file__))
    fallback = os.path.abspath(os.path.join(base, "..", "docs", "superpowers", "specs", "music_user_memory.md"))
    if os.path.isfile(fallback):
        return fallback
    return ""

def build_exec_env():
    home = os.path.expanduser("~")
    extras = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        os.path.join(home, ".npm-global", "bin"),
        os.path.join(home, ".local", "bin"),
        os.path.join(home, ".bun", "bin"),
        os.path.join(home, ".cargo", "bin"),
    ]
    current = os.environ.get("PATH", "")
    merged = []
    for p in extras + current.split(":"):
        if p and p not in merged:
            merged.append(p)
    env = dict(os.environ)
    env["HOME"] = os.environ.get("HOME", home)
    env["PATH"] = ":".join(merged)
    return env

def find_claude_binary():
    env_bin = os.environ.get("CLAUDE_BIN") or os.environ.get("CLAUDE_PATH")
    if env_bin and os.path.isfile(env_bin):
        return env_bin
    which = shutil.which("claude")
    if which:
        return which
    for shell in ("zsh", "bash"):
        shell_path = shutil.which(shell)
        if not shell_path:
            continue
        try:
            result = subprocess.run(
                [shell_path, "-lc", "command -v claude 2>/dev/null || true"],
                capture_output=True,
                text=True,
                timeout=5,
                env=build_exec_env(),
            )
            candidate = str(result.stdout or "").strip()
            if candidate and os.path.isfile(candidate):
                return candidate
        except Exception:
            pass
    home = os.path.expanduser("~")
    candidates = [
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
        os.path.join(home, ".npm-global", "bin", "claude"),
        os.path.join(home, "workspace", ".npm-global", "bin", "claude"),
        os.path.join(home, ".local", "bin", "claude"),
        os.path.join(home, ".bun", "bin", "claude"),
        os.path.join(home, ".cargo", "bin", "claude"),
    ]
    for p in candidates:
        if os.path.isfile(p):
            return p
    return ""

def sanitize_markdown_output(text, required_heading):
    raw = str(text or "").strip()
    if not raw:
        return ""

    m = re.search(r"```(?:markdown|md)?\s*\n([\s\S]*?)\n```", raw, re.IGNORECASE)
    if m:
        raw = m.group(1).strip()

    idx = raw.find(required_heading)
    if idx != -1:
        raw = raw[idx:].strip()

    lines = []
    for line in raw.splitlines():
        if line.strip().startswith("```"):
            continue
        lines.append(line.rstrip())
    return "\n".join(lines).strip()

def fetch_json(url, headers=None, timeout=12):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        data = resp.read().decode(charset, errors="replace")
        return json.loads(data)

def weather_code_to_zh(code):
    try:
        c = int(code)
    except Exception:
        return ""
    mapping = {
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
        99: "强雷暴伴冰雹",
    }
    return mapping.get(c, "")

def get_time_segment(now=None):
    dt = now or datetime.datetime.now()
    h = dt.hour
    if 5 <= h < 11:
        return "早上"
    if 11 <= h < 14:
        return "中午"
    if 14 <= h < 18:
        return "下午"
    if 18 <= h < 23:
        return "晚上"
    return "深夜"

def read_music_memory_file(max_chars=6000):
    try:
        home = os.path.expanduser("~")
        p = os.path.join(home, "Documents", "Claudiofm", "music.md")
        if not os.path.isfile(p):
            return ""
        with open(p, "r", encoding="utf-8") as f:
            content = f.read()
        content = content.strip()
        if not content:
            return ""
        return content[-max_chars:]
    except Exception:
        return ""

def get_location_name(latitude, longitude):
    try:
        params = urllib.parse.urlencode({"format": "jsonv2", "lat": str(latitude), "lon": str(longitude)})
        url = f"https://nominatim.openstreetmap.org/reverse?{params}"
        data = fetch_json(url, headers={"User-Agent": "Claudiofm/0.0.1"})
        address = data.get("address") if isinstance(data, dict) else None
        if not isinstance(address, dict):
            return ""
        for key in ("city", "town", "village", "municipality", "county", "state"):
            v = address.get(key)
            if v:
                return str(v)
        name = data.get("name") if isinstance(data, dict) else ""
        return str(name or "")
    except Exception:
        return ""

def get_weather(latitude, longitude):
    try:
        params = urllib.parse.urlencode(
            {
                "latitude": str(latitude),
                "longitude": str(longitude),
                "current_weather": "true",
                "timezone": "auto",
            }
        )
        url = f"https://api.open-meteo.com/v1/forecast?{params}"
        data = fetch_json(url, headers={"User-Agent": "Claudiofm/0.0.1"})
        cw = data.get("current_weather") if isinstance(data, dict) else None
        if not isinstance(cw, dict):
            return None
        return {
            "temperature": cw.get("temperature"),
            "windspeed": cw.get("windspeed"),
            "weathercode": cw.get("weathercode"),
        }
    except Exception:
        return None

def build_welcome_scene(latitude, longitude, profile_summary):
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_seg = get_time_segment(now)

    pieces = [f"今天是 {date_str}，{time_seg}"]

    location = ""
    weather = None
    if latitude is not None and longitude is not None:
        location = get_location_name(latitude, longitude)
        weather = get_weather(latitude, longitude)

    if location:
        pieces.append(f"你在 {location}")
    if weather:
        desc = weather_code_to_zh(weather.get("weathercode"))
        t = weather.get("temperature")
        w = weather.get("windspeed")
        wx = "天气信息"
        if desc and t is not None:
            wx = f"{desc}，{t}℃"
        elif desc:
            wx = desc
        elif t is not None:
            wx = f"{t}℃"
        if w is not None:
            wx = f"{wx}，风速 {w}"
        pieces.append(f"当前{wx}")

    mem_file = read_music_memory_file()
    scene_lines = []
    scene_lines.append("；".join(pieces))
    scene_lines.append("")
    scene_lines.append("【历史记忆（profileSummary）】")
    scene_lines.append(str(profile_summary or "").strip() or "(空)")
    if mem_file:
        scene_lines.append("")
        scene_lines.append("【历史记忆文件（music.md 摘要）】")
        scene_lines.append(mem_file)

    return "\n".join(scene_lines).strip()

def read_message():
    header = sys.stdin.buffer.read(4)
    if len(header) < 4:
        return None
    length = struct.unpack('I', header)[0]
    payload = sys.stdin.buffer.read(length)
    return json.loads(payload.decode('utf-8'))

def send_message(obj):
    json_bytes = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    header = struct.pack('I', len(json_bytes))
    sys.stdout.buffer.write(header + json_bytes)
    sys.stdout.buffer.flush()

def build_schema():
    return {
        "type": "object",
        "properties": {
            "say": {"type": "string"},
            "reason": {"type": "string"},
            "play": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "artist": {"type": "string"},
                        "album": {"type": "string"},
                        "provider": {"type": "string"},
                        "query": {"type": "string"},
                        "streamUrl": {"type": "string"}
                    },
                    "required": ["name", "artist"]
                }
            },
            "segue": {"type": "string"},
            "memory": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string"},
                        "text": {"type": "string"}
                    },
                    "required": ["type", "text"]
                }
            }
        },
        "required": ["say", "play", "memory"]
    }

def apply_memory(profile_summary, memory):
    lines = (profile_summary or "").split("\n")
    existing = set(lines)
    for m in memory or []:
        mtype = m.get("type", "taste") if m else "taste"
        text = m.get("text", "") if m else ""
        line = f"- [{mtype}] {text}".strip()
        if text and line not in existing:
            existing.add(line)
            lines.append(line)
    return "\n".join(lines[-200:])

def build_prompt(input_data):
    dj_raw = input_data.get("djName", "Claudio")
    dj = str(dj_raw).replace("\n", " ").replace("\r", " ").strip()[:24]
    if not dj:
        dj = "Claudio"
    provider = input_data.get("provider", "qq")
    profile = input_data.get("profileSummary", "")
    scene = input_data.get("scene", "")
    force = input_data.get("forceProfileRefresh", False)

    instructions = [
        f"你是 Claudiofm 的 DJ {dj}。回复必须是中文。",
        "你的任务：根据用户消息、画像摘要、场景信息，给出电台式回应，并推荐 5-10 首适合当前场景的歌曲。",
        f"当前音源来源偏好：{provider}。",
        "必须输出 JSON，字段遵循给定 schema。",
        "play 数组长度必须在 5 到 10 之间。",
        "每首歌只输出 name/artist；album/query/provider 可选。",
        "memory 用于写回画像偏好，尽量输出 1-3 条可执行的偏好更新。",
    ]
    if force:
        instructions.append("这是一次画像自检更新，请务必输出 2-3 条高质量 memory 用于纠偏与巩固偏好。")

    return "\n".join([
        "\n".join(instructions),
        "",
        "【画像摘要】",
        profile or "(空)",
        "",
        "【场景信息】",
        scene or "(空)",
        "",
        "【用户消息】",
        input_data.get("text", "")
    ])

def parse_songs_from_text(text):
    songs = []
    lines = text.split("\n")
    for line in lines:
        line = line.strip()
        patterns = [
            r'^\d+[.、]\s*["\"](.+?)["\"]\s*[-–]\s*["\"](.+?)["\"]',
            r'^\d+[.、]\s*(.+?)\s*[-–]\s*(.+)',
            r'["\"](.+?)["\"]\s*[-–]\s*["\"](.+?)["\"]',
            r'^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|',
        ]
        for pattern in patterns:
            m = re.match(pattern, line)
            if m:
                name = m.group(1).strip()
                artist = m.group(2).strip()
                if name and artist and len(name) > 0 and len(artist) > 0 and name not in ('歌曲', '歌手', 'name', 'artist'):
                    songs.append({"name": name, "artist": artist})
                    break
    return songs[:10]

def extract_structured_from_claude_payload(payload):
    if not isinstance(payload, dict):
        return None
    structured = payload.get("structured_output")
    if isinstance(structured, dict):
        return structured
    if "say" in payload and "play" in payload and "memory" in payload:
        return payload
    raw = payload.get("result", None)
    if isinstance(raw, str):
        s = raw.strip()
        if s.startswith("{") and s.endswith("}"):
            try:
                obj = json.loads(s)
                if isinstance(obj, dict) and "say" in obj and "play" in obj and "memory" in obj:
                    return obj
            except Exception:
                return None
    return None

def run_claude(prompt, schema):
    claude_path = find_claude_binary()
    if not claude_path:
        return {
            "ok": False,
            "error": "Claude CLI not found: please install Claude Code so that `claude` is available in PATH, or set CLAUDE_PATH/CLAUDE_BIN to the full executable path.",
        }
    args = [
        claude_path,
        "--bare",
        "-p", prompt,
        "--output-format", "json",
        "--json-schema", json.dumps(schema)
    ]
    result = subprocess.run(args, capture_output=True, text=True, timeout=90, env=build_exec_env())
    if result.returncode != 0:
        return {"ok": False, "error": result.stderr or f"claude exited {result.returncode}"}

    try:
        payload = json.loads(result.stdout)
        if isinstance(payload, dict):
            if payload.get("is_error") is True or payload.get("subtype") in ("error", "failed"):
                message = payload.get("result") or payload.get("error") or payload.get("message") or "claude error"
                return {"ok": False, "error": str(message)}

        structured = extract_structured_from_claude_payload(payload)
        if structured:
            return {"ok": True, "result": structured}

        text_result = payload.get("result", "") if isinstance(payload, dict) else ""
        songs = parse_songs_from_text(text_result)
        if songs:
            return {
                "ok": True,
                "result": {
                    "say": text_result[:500],
                    "reason": "",
                    "play": songs,
                    "segue": "",
                    "memory": []
                }
            }

        detail = ""
        if isinstance(payload, dict):
            detail = payload.get("result") or payload.get("message") or payload.get("subtype") or ""
        detail = str(detail)[:240]
        if detail:
            return {"ok": False, "error": f"No structured output and could not parse songs from text: {detail}"}
        return {"ok": False, "error": "No structured output and could not parse songs from text"}
    except json.JSONDecodeError:
        return {"ok": False, "error": f"invalid json from claude: {result.stdout[:500]}"}

def export_memory_md(dj_name, profile_summary):
    home = os.path.expanduser("~")
    folder = os.path.join(home, "Documents", "Claudiofm")
    path = os.path.join(folder, "music.md")
    os.makedirs(folder, exist_ok=True)

    dj = str(dj_name or "Claudio").replace("\n", " ").replace("\r", " ").strip()[:24] or "Claudio"
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    summary = str(profile_summary or "").strip()

    lines = []
    lines.append("# Claudiofm Memory")
    lines.append("")
    lines.append(f"- DJ: {dj}")
    lines.append(f"- Exported: {now}")
    lines.append("")
    lines.append("## Profile Summary")
    lines.append("")
    if summary:
        for line in summary.splitlines():
            lines.append(f"> {line}")
    else:
        lines.append("> (空)")
    lines.append("")

    content = "\n".join(lines)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

    return {"ok": True, "path": path}

def optimize_memory_file(dj_name, profile_summary, template_path):
    home = os.path.expanduser("~")
    folder = os.path.join(home, "Documents", "Claudiofm")
    out_path = os.path.join(folder, "music.md")
    os.makedirs(folder, exist_ok=True)

    template_path = resolve_template_path(template_path)
    if not template_path or not os.path.isfile(template_path):
        return {"ok": False, "error": f"template not found: {template_path}"}

    try:
        with open(template_path, "r", encoding="utf-8") as f:
            template = f.read()
    except Exception as e:
        return {"ok": False, "error": f"read template failed: {str(e)}"}

    existing = ""
    try:
        if os.path.isfile(out_path):
            with open(out_path, "r", encoding="utf-8") as f:
                existing = f.read()
    except Exception:
        existing = ""

    dj = str(dj_name or "Claudio").replace("\n", " ").replace("\r", " ").strip()[:24] or "Claudio"
    summary = str(profile_summary or "").strip()

    prompt = "\n".join([
        "你是一个音乐偏好画像整理器。请把“现有记忆”整理为严格遵循“模板”的 Markdown 文档。",
        "要求：",
        "1) 输出必须是 Markdown，且结构与标题层级必须与模板一致。",
        "2) 充分利用现有记忆信息补全模板中能补全的字段；无法确定的保持为空或占位符。",
        "3) 去重、归类、措辞简洁；不要输出与模板无关的说明文字。",
        "4) 不要用任何代码块（不要输出 ```markdown 或 ```）。",
        f"4) DJ 名称为：{dj}",
        "",
        "【模板】",
        template,
        "",
        "【现有记忆】",
        existing.strip() or "(空)",
        "",
        "【profileSummary】",
        summary or "(空)",
        "",
        "现在开始输出整理后的 Markdown："
    ])

    claude_path = find_claude_binary()
    args = [claude_path, "--bare", "-p", prompt]
    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=90,
            env=build_exec_env(),
        )
    except Exception as e:
        return {"ok": False, "error": str(e)}

    if result.returncode != 0:
        return {"ok": False, "error": result.stderr or f"claude exited {result.returncode}"}

    md = sanitize_markdown_output(result.stdout or "", "# 用户音乐记忆画像档案")
    if not md:
        return {"ok": False, "error": "empty output from claude"}

    if not md.lstrip().startswith("# 用户音乐记忆画像档案"):
        return {"ok": False, "error": "output does not follow template heading"}

    try:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(md + "\n")
    except Exception as e:
        return {"ok": False, "error": f"write failed: {str(e)}"}

    return {"ok": True, "path": out_path}

def append_daily_conversation(kind, user_text, result):
    home = os.path.expanduser("~")
    folder = os.path.join(home, "Documents", "Claudiofm")
    os.makedirs(folder, exist_ok=True)
    date_key = datetime.datetime.now().strftime("%Y%m%d")
    file_path = os.path.join(folder, f"{date_key}_music_memory.md")

    time_str = datetime.datetime.now().strftime("%H:%M:%S")
    k = str(kind or "chat").strip() or "chat"
    user_text = str(user_text or "").strip()
    data = result if isinstance(result, dict) else {}

    say = str(data.get("say", "") or "").strip()
    reason = str(data.get("reason", "") or "").strip()
    assistant_text = "\n\n".join([p for p in [say, reason] if p])
    if not assistant_text:
        assistant_text = "(空)"

    play = data.get("play", [])
    tracks = []
    if isinstance(play, list):
        for t in play:
            if not isinstance(t, dict):
                continue
            name = str(t.get("name", "") or "").strip()
            artist = str(t.get("artist", "") or "").strip()
            title = " - ".join([p for p in [name, artist] if p]).strip()
            tracks.append(title or "未知歌曲")

    if not os.path.isfile(file_path):
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(f"# {date_key} Music Memory\n\n")

    lines = []
    lines.append(f"## {time_str}")
    lines.append(f"- type: {k}")
    if user_text:
        lines.append("")
        lines.append("### user")
        lines.append(user_text)
    lines.append("")
    lines.append("### assistant")
    lines.append(assistant_text)
    if tracks:
        lines.append("")
        lines.append("### playlist")
        for i, t in enumerate(tracks, start=1):
            lines.append(f"{i}. {t}")
    lines.append("")

    with open(file_path, "a", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return {"ok": True, "path": file_path}

def read_memory_file(max_chars=20000):
    home = os.path.expanduser("~")
    file_path = os.path.join(home, "Documents", "Claudiofm", "music.md")
    if not os.path.isfile(file_path):
        return {"ok": False, "error": f"file not found: {file_path}"}
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    content = str(content or "")
    if max_chars and len(content) > max_chars:
        content = content[-max_chars:]
    return {"ok": True, "path": file_path, "content": content}

def ensure_music_file(template_path):
    home = os.path.expanduser("~")
    folder = os.path.join(home, "Documents", "Claudiofm")
    file_path = os.path.join(folder, "music.md")
    if os.path.isfile(file_path):
        return {"ok": True, "path": file_path, "created": False}
    template_path = resolve_template_path(template_path)
    if not template_path or not os.path.isfile(template_path):
        return {"ok": False, "error": f"template not found: {template_path}"}
    os.makedirs(folder, exist_ok=True)
    with open(template_path, "r", encoding="utf-8") as f:
        template = f.read()
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(str(template or "").rstrip() + "\n")
    return {"ok": True, "path": file_path, "created": True}

def main():
    while True:
        msg = read_message()
        if not msg:
            break
        mtype = msg.get("type")
        if mtype == "exportMemoryMd":
            try:
                resp = export_memory_md(msg.get("djName", "Claudio"), msg.get("profileSummary", ""))
                send_message(resp)
            except Exception as e:
                send_message({"ok": False, "error": str(e)})
            continue
        if mtype == "optimizeMemoryFile":
            try:
                resp = optimize_memory_file(
                    msg.get("djName", "Claudio"),
                    msg.get("profileSummary", ""),
                    msg.get("templatePath", ""),
                )
                send_message(resp)
            except Exception as e:
                send_message({"ok": False, "error": str(e)})
            continue
        if mtype == "welcome":
            try:
                schema = build_schema()
                profile = str(msg.get("profileSummary", "") or "")
                lat = msg.get("latitude", None)
                lon = msg.get("longitude", None)
                try:
                    lat = float(lat) if lat is not None else None
                    lon = float(lon) if lon is not None else None
                except Exception:
                    lat = None
                    lon = None

                scene = build_welcome_scene(lat, lon, profile)
                payload = {
                    "djName": msg.get("djName", "Claudio"),
                    "provider": msg.get("provider", "paojiao"),
                    "profileSummary": profile,
                    "scene": scene,
                    "text": "请用电台 DJ 的口吻对我说一句开场欢迎语，并根据时间/地点/天气/历史记忆推荐 5-10 首适合现在的歌。",
                    "forceProfileRefresh": False,
                }
                prompt = build_prompt(payload)
                resp = run_claude(prompt, schema)
                if not resp.get("ok"):
                    send_message(resp)
                    continue
                next_profile = apply_memory(profile, resp["result"].get("memory", []))
                send_message({"ok": True, "result": resp["result"], "profileSummary": next_profile})
            except Exception as e:
                send_message({"ok": False, "error": str(e)})
            continue
        if mtype == "appendDailyConversation":
            try:
                resp = append_daily_conversation(
                    msg.get("kind", "chat"),
                    msg.get("userText", ""),
                    msg.get("result", {}),
                )
                send_message(resp)
            except Exception as e:
                send_message({"ok": False, "error": str(e)})
            continue
        if mtype == "readMemoryFile":
            try:
                resp = read_memory_file()
                send_message(resp)
            except Exception as e:
                send_message({"ok": False, "error": str(e)})
            continue
        if mtype == "ensureMusicFile":
            try:
                resp = ensure_music_file(msg.get("templatePath", ""))
                send_message(resp)
            except Exception as e:
                send_message({"ok": False, "error": str(e)})
            continue
        if mtype != "chat":
            send_message({"ok": False, "error": "unknown message type"})
            continue

        schema = build_schema()
        prompt = build_prompt(msg)
        resp = run_claude(prompt, schema)

        if not resp.get("ok"):
            send_message(resp)
            continue

        next_profile = apply_memory(msg.get("profileSummary", ""), resp["result"].get("memory", []))
        send_message({"ok": True, "result": resp["result"], "profileSummary": next_profile})

if __name__ == "__main__":
    main()
