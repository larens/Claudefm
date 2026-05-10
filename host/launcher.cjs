#!/usr/bin/env node
const { execFileSync } = require("child_process");
execFileSync("/opt/homebrew/bin/node", ["/Users/lairuisi/workspace/Claudiofm/claudiofm-chrome-extension/host/host.cjs"], { stdio: "inherit" });