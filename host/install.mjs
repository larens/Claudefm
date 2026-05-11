import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = String(argv[i] || "");
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
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

function getPlatformConfigName(platform) {
  if (platform === "darwin") return "install-macos.json";
  if (platform === "win32") return "install-windows.json";
  return "install-linux.json";
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveConfig(platform, args) {
  const candidates = [];
  if (args.config) candidates.push(path.resolve(process.cwd(), String(args.config)));
  candidates.push(path.resolve(__dirname, getPlatformConfigName(platform)));
  candidates.push(path.resolve(__dirname, "install-macos.json"));
  for (const filePath of candidates) {
    const parsed = readJsonFile(filePath);
    if (parsed && typeof parsed === "object") {
      return { path: filePath, config: parsed };
    }
  }
  return { path: candidates[0], config: {} };
}

function normalizeExtensionIds(config, args) {
  const extensionIds = [];
  const add = (value) => {
    const id = String(value || "").trim();
    if (!id) return;
    if (!extensionIds.includes(id)) extensionIds.push(id);
  };
  if (Array.isArray(config.extensionIds)) config.extensionIds.forEach(add);
  add(config.extensionId);
  add(args.extensionId);
  if (args.extensionIds) {
    String(args.extensionIds)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach(add);
  }
  return extensionIds;
}

function isAbsolutePathForCurrentPlatform(targetPath) {
  return path.isAbsolute(String(targetPath || ""));
}

function resolveDataDir(platform, config, args) {
  const requested = args.dataDir || config.dataDir || process.env.CLAUDEFM_DATA_DIR || "";
  if (requested) {
    if (!isAbsolutePathForCurrentPlatform(requested)) {
      throw new Error(`dataDir must be an absolute path: ${requested}`);
    }
    return path.resolve(String(requested));
  }
  const home = os.homedir();
  if (platform === "darwin") return path.join(home, "Documents", "Claudefm");
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "Claudefm");
  }
  const xdgDataHome = process.env.XDG_DATA_HOME;
  return path.join(xdgDataHome || path.join(home, ".local", "share"), "Claudefm");
}

function resolveTemplatePath() {
  const candidate = path.resolve(__dirname, "..", "docs", "superpowers", "specs", "music_user_memory.md");
  if (!fs.existsSync(candidate)) {
    throw new Error(`music template not found: ${candidate}`);
  }
  return candidate;
}

function ensureExecutable(targetPath) {
  try {
    fs.chmodSync(targetPath, 0o755);
  } catch {}
}

function ensureDir(targetPath, summary) {
  if (fs.existsSync(targetPath)) {
    summary.reused.push(targetPath);
    return;
  }
  fs.mkdirSync(targetPath, { recursive: true });
  summary.created.push(targetPath);
}

function ensureFile(targetPath, content, summary) {
  if (fs.existsSync(targetPath)) {
    summary.reused.push(targetPath);
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
  summary.created.push(targetPath);
}

function writeRuntimeConfig(data) {
  const runtimeConfigPath = path.resolve(__dirname, "runtime-config.json");
  fs.writeFileSync(runtimeConfigPath, JSON.stringify(data, null, 2), "utf8");
  return runtimeConfigPath;
}

function initializeRuntimeData(dataDir) {
  const summary = { created: [], reused: [] };
  const templatePath = resolveTemplatePath();
  const template = String(fs.readFileSync(templatePath, "utf8") || "").trimEnd() + "\n";
  ensureDir(dataDir, summary);
  ensureDir(path.join(dataDir, "cache"), summary);
  ensureDir(path.join(dataDir, "cache", "tracks"), summary);
  ensureDir(path.join(dataDir, "cache", "covers"), summary);
  ensureFile(path.join(dataDir, "music.md"), template, summary);
  ensureFile(path.join(dataDir, "list.md"), "# 历史播放歌单\n\n", summary);
  ensureFile(
    path.join(dataDir, "README.txt"),
    [
      "Claudefm local runtime data",
      "",
      "music.md  : user music memory profile",
      "list.md   : playlist history",
      "cache/    : cached tracks and covers",
      "",
      "You can delete cache contents safely. Keep music.md and list.md if you want to preserve history.",
      "",
    ].join("\n"),
    summary
  );
  return summary;
}

function writeManifestToDirs(manifest, dirs) {
  const result = { manifestPaths: [], failures: [] };
  for (const targetDir of dirs) {
    const manifestPath = path.join(targetDir, "com.claudefm.host.json");
    try {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
      result.manifestPaths.push(manifestPath);
    } catch (error) {
      const message = error?.message ? String(error.message) : String(error);
      result.failures.push({ path: manifestPath, message });
    }
  }
  return result;
}

function windowsRegAdd(browserKey, manifestPath) {
  try {
    execFileSync("reg", ["add", browserKey, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function installWindows(manifest) {
  const manifestPath = path.resolve(__dirname, "com.claudefm.host.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  const hostName = "com.claudefm.host";
  const registryKeys = [
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`,
    `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${hostName}`,
    `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${hostName}`,
    `HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${hostName}`,
    `HKCU\\Software\\Vivaldi\\NativeMessagingHosts\\${hostName}`,
  ];
  const registeredKeys = [];
  const warnings = [];
  for (const registryKey of registryKeys) {
    if (windowsRegAdd(registryKey, manifestPath)) registeredKeys.push(registryKey);
  }
  if (!registeredKeys.length) {
    warnings.push(`Windows registry install may have failed. Set the default REG_SZ value to: ${manifestPath}`);
  }
  return { manifestPaths: [manifestPath], registeredKeys, warnings };
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
  return writeManifestToDirs(manifest, targets);
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
  return writeManifestToDirs(manifest, targets);
}

function printSummary({
  platform,
  configPath,
  hostPath,
  dataDir,
  extensionIds,
  initSummary,
  installResult,
  runtimeConfigPath,
}) {
  const warnings = [...(installResult.warnings || [])];
  for (const failure of installResult.failures || []) {
    warnings.push(`Manifest write failed: ${failure.path} (${failure.message})`);
  }
  const lines = [
    "Claudefm host install complete.",
    `Platform: ${platform}`,
    `Config: ${configPath}`,
    `Runtime config: ${runtimeConfigPath}`,
    `Launcher: ${hostPath}`,
    `Data dir: ${dataDir}`,
    `Extension IDs: ${extensionIds.join(", ")}`,
    "",
    "Created:",
    ...(initSummary.created.length ? initSummary.created.map((item) => `- ${item}`) : ["- (none)"]),
    "",
    "Reused:",
    ...(initSummary.reused.length ? initSummary.reused.map((item) => `- ${item}`) : ["- (none)"]),
    "",
    "Manifest paths:",
    ...((installResult.manifestPaths || []).length ? installResult.manifestPaths.map((item) => `- ${item}`) : ["- (none)"]),
  ];
  if ((installResult.registeredKeys || []).length) {
    lines.push("", "Windows registry keys:", ...installResult.registeredKeys.map((item) => `- ${item}`));
  }
  if (warnings.length) {
    lines.push("", "Warnings:", ...warnings.map((item) => `- ${item}`));
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

const platform = os.platform();
const args = parseArgs(process.argv.slice(2));
const { path: configPath, config } = resolveConfig(platform, args);
const extensionIds = normalizeExtensionIds(config, args);
if (!extensionIds.length) {
  throw new Error(
    "Missing extensionId. Set the platform install JSON (install-macos/install-linux/install-windows) or pass --extensionId <id>."
  );
}

const defaultHostPath =
  platform === "win32" ? path.resolve(__dirname, "claudefm-host.cmd") : path.resolve(__dirname, "claudefm-host.sh");
const hostPath = String(args.hostAbsolutePath || config.hostAbsolutePath || defaultHostPath);
if (!hostPath) throw new Error("Missing hostAbsolutePath");
if (!isAbsolutePathForCurrentPlatform(hostPath)) {
  throw new Error(`hostAbsolutePath must be an absolute path: ${hostPath}`);
}
if (platform !== "win32") ensureExecutable(hostPath);

const dataDir = resolveDataDir(platform, config, args);
const initSummary = initializeRuntimeData(dataDir);
const runtimeConfigPath = writeRuntimeConfig({ dataDir });

const manifest = {
  name: "com.claudefm.host",
  description: "Claudefm Native Host",
  path: hostPath,
  type: "stdio",
  allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
};

let installResult;
if (platform === "win32") installResult = installWindows(manifest);
else if (platform === "darwin") installResult = installMac(manifest);
else installResult = installLinux(manifest);

printSummary({
  platform,
  configPath,
  hostPath,
  dataDir,
  extensionIds,
  initSummary,
  installResult,
  runtimeConfigPath,
});
