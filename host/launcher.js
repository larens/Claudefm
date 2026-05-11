#!/usr/bin/env node
const path = require("node:path");
const { spawn } = require("node:child_process");

const hostPath = path.resolve(__dirname, "host.cjs");
const child = spawn(process.execPath, [hostPath], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code || 0));
