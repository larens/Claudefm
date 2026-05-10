import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(__dirname, "install-macos.json");
const raw = fs.readFileSync(configPath, "utf8");
const config = JSON.parse(raw);

if (!config.extensionId) {
  throw new Error("install-macos.json: extensionId 不能为空");
}
const defaultHostAbsolutePath = path.resolve(__dirname, "claudiofm-host.sh");

const extensionIds = [];
if (Array.isArray(config.extensionIds)) {
  for (const id of config.extensionIds) {
    const v = String(id || "").trim();
    if (v) extensionIds.push(v);
  }
}
if (!extensionIds.includes(config.extensionId)) {
  extensionIds.unshift(config.extensionId);
}

const manifest = {
  name: "com.claudiofm.host",
  description: "Claudiofm Native Host",
  path: config.hostAbsolutePath || defaultHostAbsolutePath,
  type: "stdio",
  allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
};

const targets = [
  ["Google", "Chrome"],
  ["Google", "Chrome Beta"],
  ["Google", "Chrome Dev"],
  ["Google", "Chrome Canary"],
  ["Chromium"],
  ["Microsoft Edge"],
  ["Microsoft Edge Beta"],
  ["Microsoft Edge Dev"],
  ["Microsoft Edge Canary"],
  ["BraveSoftware", "Brave-Browser"],
  ["BraveSoftware", "Brave-Browser-Beta"],
  ["BraveSoftware", "Brave-Browser-Dev"],
  ["Vivaldi"],
  ["Arc"],
].map((parts) =>
  path.join(
    os.homedir(),
    "Library",
    "Application Support",
    ...parts,
    "NativeMessagingHosts"
  )
);

let wrote = false;
for (const targetDir of targets) {
  const manifestPath = path.join(targetDir, "com.claudiofm.host.json");
  try {
    try {
      fs.chmodSync(manifest.path, 0o755);
    } catch {}
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    process.stdout.write(`OK: ${manifestPath}\n`);
    wrote = true;
  } catch (e) {
    const message = e?.message ? String(e.message) : String(e);
    process.stderr.write(`FAILED: ${manifestPath}\n${message}\n`);
  }
}

if (!wrote) {
  process.stdout.write(
    JSON.stringify(
      {
        name: "com.claudiofm.host",
        description: "Claudiofm Native Host",
        path: config.hostAbsolutePath,
        type: "stdio",
        allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
      },
      null,
      2
    ) + "\n"
  );
}
