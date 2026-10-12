import path from "path"
import fs from "fs"
import { parse } from "jsonc-parser"
import { Path } from "@opencode/util/global"

const blockedHosts = ["opencode.ai", "claude.ai"]

let blockerEnabled = checkInitialGlobalConfig()
let installed = false

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim().replace(/\.+$/, "")
  return blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))
}

export function isBlockedUrl(urlString: string | URL): boolean {
  if (urlString instanceof URL) return isBlockedHost(urlString.hostname)
  if (typeof urlString !== "string") return false
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

export function setNetworkBlockerEnabled(enabled: boolean) {
  blockerEnabled = enabled
}

export function isNetworkBlockerEnabled(): boolean {
  return blockerEnabled
}

function checkFileForBlock(file: string): boolean | undefined {
  if (!fs.existsSync(file)) return undefined
  try {
    const parsed: unknown = parse(fs.readFileSync(file, "utf8"))
    if (parsed && typeof parsed === "object" && "block_opencode_claude_network" in parsed) {
      const value = (parsed as { block_opencode_claude_network?: unknown }).block_opencode_claude_network
      if (typeof value === "boolean") return value
    }
  } catch {
    // Ignore read errors
  }
  return undefined
}

/**
 * Reads the global config file directly so the fetch wrapper can honor the
 * setting before the Effect config layer loads. The config layer refreshes
 * this state on every load and reload.
 */
export function checkInitialGlobalConfig(): boolean {
  try {
    if (process.env.OPENCODE_CONFIG_CONTENT) {
      const parsed: unknown = parse(process.env.OPENCODE_CONFIG_CONTENT)
      if (parsed && typeof parsed === "object" && "block_opencode_claude_network" in parsed) {
        const value = (parsed as { block_opencode_claude_network?: unknown }).block_opencode_claude_network
        if (typeof value === "boolean") return value
      }
    }

    if (process.env.OPENCODE_CONFIG) {
      const result = checkFileForBlock(process.env.OPENCODE_CONFIG)
      if (result !== undefined) return result
    }

    const configDir = process.env.OPENCODE_CONFIG_DIR ?? Path.config
    for (const name of ["opencode.json", "opencode.jsonc"]) {
      const result = checkFileForBlock(path.join(configDir, name))
      if (result !== undefined) return result
    }

    if (!process.env.OPENCODE_CONFIG_DIR) {
      const cwd = process.cwd()
      for (const name of [
        path.join(cwd, "opencode.json"),
        path.join(cwd, "opencode.jsonc"),
        path.join(cwd, ".opencode", "opencode.jsonc"),
        path.join(cwd, ".opencode", "opencode.json"),
      ]) {
        const result = checkFileForBlock(name)
        if (result !== undefined) return result
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
    return originalFetch.call(this, input, init)
  }

  Object.assign(wrappedFetch, originalFetch)
  globalThis.fetch = wrappedFetch as typeof fetch
}

installGlobalFetchBlocker()

export * as NetworkBlocker from "./network-blocker.js"
