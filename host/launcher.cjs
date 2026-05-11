#!/usr/bin/env node
const path = require("node:path");
const { execFileSync } = require("node:child_process");

execFileSync(process.execPath, [path.resolve(__dirname, "host.cjs")], { stdio: "inherit" });
