import path from "path"
import fs from "fs"
import { parse } from "jsonc-parser"
import { Path } from "./global"
import { Flag } from "./flag/flag"

let blockerEnabled = false
let installed = false

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim()
  return (
    host === "opencode.ai" ||
    host.endsWith(".opencode.ai") ||
    host === "claude.ai" ||
    host.endsWith(".claude.ai")
  )
}

export function isBlockedUrl(urlString: string | URL): boolean {
  try {
    const parsed = typeof urlString === "string" ? new URL(urlString) : urlString
    return isBlockedHost(parsed.hostname)
  } catch {
    return false
  }
}

export function setNetworkBlockerEnabled(enabled: boolean) {
  blockerEnabled = enabled
}

export function isNetworkBlockerEnabled(): boolean {
  return blockerEnabled
}

export function checkInitialGlobalConfig(): boolean {
  try {
    const configDir = Flag.OPENCODE_CONFIG_DIR ?? Path.config
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const file = path.join(configDir, name)
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, "utf8")
        const parsed = parse(content)
        if (parsed && typeof parsed.block_opencode_claude_network === "boolean") {
          return parsed.block_opencode_claude_network
        }
      }
    }
  } catch {
    // Ignore any read error
  }
  return false
}

export function installGlobalFetchBlocker() {
  if (installed || typeof globalThis.fetch !== "function") return
  installed = true
  const originalFetch = globalThis.fetch

  blockerEnabled = checkInitialGlobalConfig()

  const wrappedFetch = async function (this: unknown, input: string | URL | Request, init?: RequestInit) {
    if (blockerEnabled) {
      let urlString = ""
      if (typeof input === "string") {
        urlString = input
      } else if (input instanceof URL) {
        urlString = input.href
      } else if (input && typeof input === "object" && "url" in input) {
        urlString = input.url
      }
      if (urlString && isBlockedUrl(urlString)) {
        let hostname = urlString
        try {
          hostname = new URL(urlString).hostname
        } catch {
          // Ignore parse errors
        }
        throw new Error(`Network request to ${hostname} is blocked by configuration (block_opencode_claude_network)`)
      }
    }
    return originalFetch.call(this, input as any, init)
  }

  Object.assign(wrappedFetch, originalFetch)
  globalThis.fetch = wrappedFetch as typeof fetch
}

export * as NetworkBlocker from "./network-blocker"
