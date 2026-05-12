const fs = require("node:fs");
const path = require("node:path");

const AI_TOOLS_PATH = path.join(__dirname, "ai-tools.json");

let AI_TOOLS = [];
try {
  AI_TOOLS = JSON.parse(fs.readFileSync(AI_TOOLS_PATH, "utf8"));
} catch {
  AI_TOOLS = [];
}

function getToolById(id) {
  if (!id) return null;
  const s = String(id).trim();
  return AI_TOOLS.find((t) => t.id === s) || null;
}

function getCallableTools() {
  return AI_TOOLS.filter((t) => t.executionMode === "cli");
}

function getAllTools() {
  return AI_TOOLS.slice();
}

module.exports = { AI_TOOLS, getToolById, getCallableTools, getAllTools };
