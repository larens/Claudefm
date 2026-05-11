import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = String(argv[i] || "");
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next != null && !String(next).startsWith("--")) {
      out[key] = String(next);
      i += 1;
    } else {
      out[key] = "true";
    }
  }
  return out;
}

function readConfig() {
  const configPath = path.resolve(__dirname, "install-macos.json");
  let raw = "";
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    raw = "{}";
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeExtensionIds(config, args) {
  const extensionIds = [];
  const add = (v) => {
    const id = String(v || "").trim();
    if (!id) return;
    if (!extensionIds.includes(id)) extensionIds.push(id);
  };
  if (Array.isArray(config.extensionIds)) config.extensionIds.forEach(add);
  if (config.extensionId) add(config.extensionId);
  if (args.extensionId) add(args.extensionId);
  if (args.extensionIds) {
    String(args.extensionIds)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach(add);
  }
  return extensionIds;
}

function ensureExecutable(p) {
  try {
    fs.chmodSync(p, 0o755);
  } catch {}
}

function writeManifestToDirs(manifest, dirs) {
  let wrote = false;
  for (const targetDir of dirs) {
    const manifestPath = path.join(targetDir, "com.claudiofm.host.json");
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      process.stdout.write(`OK: ${manifestPath}\n`);
      wrote = true;
    } catch (e) {
      const message = e?.message ? String(e.message) : String(e);
      process.stderr.write(`FAILED: ${manifestPath}\n${message}\n`);
    }
  }
  return wrote;
}

function windowsRegAdd(browserKey, manifestPath) {
  try {
    execFileSync(
      "reg",
      ["add", browserKey, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"],
      { stdio: "inherit" }
    );
    return true;
  } catch {
    return false;
  }
}

function installWindows(manifest) {
  const manifestPath = path.resolve(__dirname, "com.claudiofm.host.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  process.stdout.write(`OK: ${manifestPath}\n`);

  const nameKey = "com.claudiofm.host";
  const keys = [
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${nameKey}`,
    `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${nameKey}`,
    `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${nameKey}`,
    `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${nameKey}`,
    `HKCU\\Software\\Vivaldi\\NativeMessagingHosts\\${nameKey}`,
  ];
  let ok = false;
  for (const k of keys) {
    const wrote = windowsRegAdd(k, manifestPath);
    if (wrote) ok = true;
  }
  if (!ok) {
    process.stdout.write(
      `\nWindows registry install may have failed. You can manually set a REG_SZ default value to:\n${manifestPath}\n`
    );
  }
}

function installMac(manifest) {
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
  ].map((parts) => path.join(os.homedir(), "Library", "Application Support", ...parts, "NativeMessagingHosts"));
  writeManifestToDirs(manifest, targets);
}

function installLinux(manifest) {
  const home = os.homedir();
  const targets = [
    path.join(home, ".config", "google-chrome", "NativeMessagingHosts"),
    path.join(home, ".config", "google-chrome-beta", "NativeMessagingHosts"),
    path.join(home, ".config", "google-chrome-unstable", "NativeMessagingHosts"),
    path.join(home, ".config", "chromium", "NativeMessagingHosts"),
    path.join(home, ".config", "microsoft-edge", "NativeMessagingHosts"),
    path.join(home, ".config", "microsoft-edge-beta", "NativeMessagingHosts"),
    path.join(home, ".config", "microsoft-edge-dev", "NativeMessagingHosts"),
    path.join(home, ".config", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts"),
    path.join(home, ".config", "BraveSoftware", "Brave-Browser-Beta", "NativeMessagingHosts"),
    path.join(home, ".config", "BraveSoftware", "Brave-Browser-Dev", "NativeMessagingHosts"),
    path.join(home, ".config", "vivaldi", "NativeMessagingHosts"),
  ];
  writeManifestToDirs(manifest, targets);
}

const args = parseArgs(process.argv.slice(2));
const config = readConfig();
const extensionIds = normalizeExtensionIds(config, args);
if (!extensionIds.length) {
  throw new Error("Missing extensionId. Set host/install-macos.json or pass --extensionId <id>.");
}

const platform = os.platform();
const defaultHostPath =
  platform === "win32" ? path.resolve(__dirname, "claudiofm-host.cmd") : path.resolve(__dirname, "claudiofm-host.sh");
const hostPath = String(args.hostAbsolutePath || config.hostAbsolutePath || defaultHostPath);
if (!hostPath) throw new Error("Missing hostAbsolutePath");

if (platform !== "win32") ensureExecutable(hostPath);

const manifest = {
  name: "com.claudiofm.host",
  description: "Claudiofm Native Host",
  path: hostPath,
  type: "stdio",
  allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
};

if (platform === "win32") installWindows(manifest);
else if (platform === "darwin") installMac(manifest);
else installLinux(manifest);

