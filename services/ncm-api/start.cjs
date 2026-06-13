#!/usr/bin/env node
const { serveNcmApi } = require("NeteaseCloudMusicApi");

const PORT = process.env.NCM_PORT || 3000;

serveNcmApi({ port: PORT, checkVersion: false })
  .then((server) => {
    console.log(`[NCM API] listening on http://localhost:${PORT}`);
    process.on("SIGINT", () => {
      console.log("[NCM API] shutting down...");
      server.close();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      console.log("[NCM API] shutting down...");
      server.close();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error("[NCM API] failed to start:", err);
    process.exit(1);
  });
