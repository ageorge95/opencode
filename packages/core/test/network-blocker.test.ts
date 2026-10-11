import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  checkInitialGlobalConfig,
  installGlobalFetchBlocker,
  isBlockedHost,
  isBlockedUrl,
  isNetworkBlockerEnabled,
  setNetworkBlockerEnabled,
} from "@opencode/core/network-blocker"

const originalConfigDir = process.env.OPENCODE_CONFIG_DIR

afterEach(() => {
  setNetworkBlockerEnabled(false)
  if (originalConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
  else process.env.OPENCODE_CONFIG_DIR = originalConfigDir
})

describe("network-blocker", () => {
  test("identifies blocked hosts and urls", () => {
    expect(isBlockedHost("opencode.ai")).toBe(true)
    expect(isBlockedHost("OPENCODE.AI")).toBe(true)
    expect(isBlockedHost("models.opencode.ai")).toBe(true)
    expect(isBlockedHost("api.opencode.ai")).toBe(true)
    expect(isBlockedHost("sub.domain.opencode.ai")).toBe(true)
    expect(isBlockedHost("claude.ai")).toBe(true)
    expect(isBlockedHost("CLAUDE.AI")).toBe(true)
    expect(isBlockedHost("api.claude.ai")).toBe(true)
    expect(isBlockedHost("sub.domain.claude.ai")).toBe(true)

    expect(isBlockedHost("notopencode.ai")).toBe(false)
    expect(isBlockedHost("notclaude.ai")).toBe(false)
    expect(isBlockedHost("api.anthropic.com")).toBe(false)
    expect(isBlockedHost("github.com")).toBe(false)

    expect(isBlockedUrl("https://opencode.ai/")).toBe(true)
    expect(isBlockedUrl("https://models.opencode.ai/api.json")).toBe(true)
    expect(isBlockedUrl("http://claude.ai/chat")).toBe(true)
    expect(isBlockedUrl("https://api.claude.ai/v1")).toBe(true)
    expect(isBlockedUrl(new URL("https://opencode.ai/docs"))).toBe(true)

    expect(isBlockedUrl("https://api.anthropic.com/v1/messages")).toBe(false)
    expect(isBlockedUrl("https://github.com/anomalyco/opencode")).toBe(false)
    expect(isBlockedUrl("invalid-url")).toBe(false)
  })

  test("reads the initial state from the global config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opencode-network-blocker-"))
    try {
      process.env.OPENCODE_CONFIG_DIR = directory
      expect(checkInitialGlobalConfig()).toBe(false)

      await writeFile(
        join(directory, "opencode.jsonc"),
        `{\n  // block network\n  "block_opencode_claude_network": true\n}`,
      )
      expect(checkInitialGlobalConfig()).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("blocks global fetch while enabled and passes other hosts through", async () => {
    installGlobalFetchBlocker()
    setNetworkBlockerEnabled(false)
    expect(isNetworkBlockerEnabled()).toBe(false)

    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ok") })
    try {
      expect((await fetch(server.url)).status).toBe(200)

      setNetworkBlockerEnabled(true)
      expect(isNetworkBlockerEnabled()).toBe(true)
      await expect(fetch("https://opencode.ai/test")).rejects.toThrow("blocked by configuration")
      await expect(fetch("https://models.opencode.ai/api.json")).rejects.toThrow("blocked by configuration")
      await expect(fetch("https://claude.ai/")).rejects.toThrow("blocked by configuration")
      await expect(fetch(new Request("https://api.claude.ai/v1"))).rejects.toThrow("blocked by configuration")

      // Loopback and unrelated hosts are never blocked.
      expect((await fetch(server.url)).status).toBe(200)

      setNetworkBlockerEnabled(false)
      expect(isNetworkBlockerEnabled()).toBe(false)
    } finally {
      await server.stop(true)
    }
  })
})
