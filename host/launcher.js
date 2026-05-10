#!/usr/bin/env node
const { spawn } = require("child_process");
const path = "/Users/lairuisi/workspace/Claudiofm/claudiofm-chrome-extension/host/host.cjs";
const child = spawn("/opt/homebrew/bin/node", [path], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code || 0));