import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

function configDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR

  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "opencode")

  return join(homedir(), ".config", "opencode")
}

/**
 * Best-effort check of the global opencode config for the network blocking
 * setting. The renderer session is blocked while any global config file sets
 * `block_opencode_claude_network` to true.
 */
export function shouldBlockNetworkRequest(): boolean {
  try {
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const file = join(configDir(), name)

      if (!existsSync(file)) continue

      if (/"block_opencode_claude_network"\s*:\s*true/.test(readFileSync(file, "utf8"))) return true
    }
  } catch {
    // Ignore read errors: an unreadable config leaves requests unblocked.
  }

  return false
}
