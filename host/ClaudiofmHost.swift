#!/usr/bin/env swift

import Foundation

let pythonPath = "/usr/bin/python3"
let scriptPath = "/Users/lairuisi/workspace/Claudiofm/claudiofm-chrome-extension/host/host.py"

let process = Process()
process.executableURL = URL(fileURLWithPath: pythonPath)
process.arguments = [scriptPath]
process.standardInput = FileHandle.standardInput
process.standardOutput = FileHandle.standardOutput
process.standardError = FileHandle.standardError

try process.run()
process.waitUntilExit()
exit(process.terminationStatus)