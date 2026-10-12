import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const blockedHosts = ["opencode.ai", "claude.ai"]

function configDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR

  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "opencode")

  return join(homedir(), ".config", "opencode")
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim().replace(/\.+$/, "")

  return blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))
}

export function isBlockedUrl(urlString: string | URL): boolean {
  if (urlString instanceof URL) return isBlockedHost(urlString.hostname)

  try {
    const parsed = new URL(urlString)

    return isBlockedHost(parsed.hostname)
  } catch {
    try {
      const parsed = new URL(`http://${urlString}`)

      return isBlockedHost(parsed.hostname)
    } catch {
      return false
    }
  }
}

function checkContent(content: string): boolean | undefined {
  if (/"block_opencode_claude_network"\s*:\s*false/.test(content)) return false

  if (/"block_opencode_claude_network"\s*:\s*true/.test(content)) return true

  return undefined
}

/**
 * Best-effort check of the global opencode config for the network blocking
 * setting. The renderer session is blocked while any global config file sets
 * `block_opencode_claude_network` to true.
 */
export function shouldBlockNetworkRequest(): boolean {
  try {
    if (process.env.OPENCODE_CONFIG_CONTENT) {
      const result = checkContent(process.env.OPENCODE_CONFIG_CONTENT)

      if (result !== undefined) return result
    }

    if (process.env.OPENCODE_CONFIG && existsSync(process.env.OPENCODE_CONFIG)) {
      const result = checkContent(readFileSync(process.env.OPENCODE_CONFIG, "utf8"))

      if (result !== undefined) return result
    }

    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const file = join(configDir(), name)

      if (!existsSync(file)) continue

      const result = checkContent(readFileSync(file, "utf8"))

      if (result !== undefined) return result
    }

    if (!process.env.OPENCODE_CONFIG_DIR) {
      const cwd = process.cwd()

      for (const name of [
        join(cwd, "opencode.json"),
        join(cwd, "opencode.jsonc"),
        join(cwd, ".opencode", "opencode.jsonc"),
        join(cwd, ".opencode", "opencode.json"),
      ]) {
        if (!existsSync(name)) continue

        const result = checkContent(readFileSync(name, "utf8"))

        if (result !== undefined) return result
      }
    }
  } catch {
    // Ignore read errors: an unreadable config leaves requests unblocked.
  }

  return false
}

let installed = false

export function installDesktopFetchBlocker() {
  if (installed || typeof globalThis.fetch === "undefined") return

  installed = true
  const originalFetch = globalThis.fetch

  const wrappedFetch = async function (input: string | URL | Request, init?: RequestInit) {
    if (shouldBlockNetworkRequest()) {
      let urlString: string

      if (input instanceof URL) {
        urlString = input.href
      } else if (input instanceof Request) {
        urlString = input.url
      } else {
        urlString = String(input)
      }

      if (isBlockedUrl(urlString)) {
        let host: string

        try {
          host = new URL(urlString).hostname
        } catch {
          try {
            host = new URL(`http://${urlString}`).hostname
          } catch {
            host = urlString
          }
        }

        throw new Error(
          `Network request to ${host} is blocked by configuration (block_opencode_claude_network)`,
        )
      }
    }

    return originalFetch(input, init)
  }

  Object.assign(wrappedFetch, originalFetch)
  // SAFETY: wrappedFetch mirrors globalThis.fetch while enforcing network blocking when configured.
  globalThis.fetch = wrappedFetch as typeof fetch
}
