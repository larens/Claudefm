#!/usr/bin/env python3
import subprocess
import json

schema = {
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
                    "artist": {"type": "string"}
                },
                "required": ["name", "artist"]
            }
        },
        "segue": {"type": "string"},
        "memory": {"type": "array"}
    },
    "required": ["say", "play", "memory"]
}

prompt = """你是 Claudiofm 的 DJ Claudio。回复必须是中文。
你的任务：根据用户消息推荐 5-10 首歌曲。
必须输出 JSON，字段遵循给定 schema。
play 数组长度必须在 5 到 10 之间。
每首歌只输出 name/artist。

【用户消息】
播放一些中文歌曲"""

result = subprocess.run(
    ["claude", "--bare", "-p", prompt, "--output-format", "json", "--json-schema", json.dumps(schema)],
    capture_output=True, text=True, timeout=30
)
print("Return code:", result.returncode)
print("STDOUT:", result.stdout[:800] if result.stdout else "empty")
if result.stderr:
    print("STDERR:", result.stderr[:200])