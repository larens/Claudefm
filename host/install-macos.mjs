import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const configPath = path.resolve(process.cwd(), "install-macos.json");
const raw = fs.readFileSync(configPath, "utf8");
const config = JSON.parse(raw);

if (!config.extensionId) {
  throw new Error("install-macos.json: extensionId 不能为空");
}
if (!config.hostAbsolutePath) {
  throw new Error("install-macos.json: hostAbsolutePath 不能为空");
}

const targetDir = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Google",
  "Chrome",
  "NativeMessagingHosts"
);

fs.mkdirSync(targetDir, { recursive: true });

const manifest = {
  name: "com.claudiofm.host",
  description: "Claudiofm Native Host",
  path: config.hostAbsolutePath,
  type: "stdio",
  allowed_origins: [`chrome-extension://${config.extensionId}/`],
};

const manifestPath = path.join(targetDir, "com.claudiofm.host.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
process.stdout.write(`OK: ${manifestPath}\n`);

