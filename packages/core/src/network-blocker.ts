import path from "path"
import fs from "fs"
import { parse } from "jsonc-parser"
import { Path } from "@opencode/util/global"

const blockedHosts = ["opencode.ai", "claude.ai"]

let blockerEnabled = false
let installed = false

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim()
  return blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))
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

/**
 * Reads the global config file directly so the fetch wrapper can honor the
 * setting before the Effect config layer loads. The config layer refreshes
 * this state on every load and reload.
 */
export function checkInitialGlobalConfig(): boolean {
  try {
    const configDir = process.env.OPENCODE_CONFIG_DIR ?? Path.config
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const file = path.join(configDir, name)
      if (!fs.existsSync(file)) continue
      const parsed: unknown = parse(fs.readFileSync(file, "utf8"))
      if (parsed && typeof parsed === "object" && "block_opencode_claude_network" in parsed) {
        const value = (parsed as { block_opencode_claude_network?: unknown }).block_opencode_claude_network
        if (typeof value === "boolean") return value
      }
    }
  } catch {
    // Ignore read errors: an unreadable config leaves the blocker disabled.
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
      let urlString: string
      if (typeof input === "string") urlString = input
      else if (input instanceof URL) urlString = input.href
      else urlString = input.url
      if (isBlockedUrl(urlString)) {
        throw new Error(
          `Network request to ${new URL(urlString).hostname} is blocked by configuration (block_opencode_claude_network)`,
        )
      }
    }
    return originalFetch.call(this, input, init)
  }

  Object.assign(wrappedFetch, originalFetch)
  globalThis.fetch = wrappedFetch as typeof fetch
}

export * as NetworkBlocker from "./network-blocker.js"
