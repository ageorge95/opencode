import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

function getConfigDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "opencode")
  return join(homedir(), ".config", "opencode")
}

export function shouldBlockNetworkRequest(): boolean {
  try {
    const dir = getConfigDir()
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const file = join(dir, name)
      if (existsSync(file)) {
        const content = readFileSync(file, "utf8")
        if (/"block_opencode_claude_network"\s*:\s*true/.test(content)) {
          return true
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return false
}
