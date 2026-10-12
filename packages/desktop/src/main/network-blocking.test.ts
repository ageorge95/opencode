import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  installDesktopFetchBlocker,
  isBlockedHost,
  isBlockedUrl,
  shouldBlockNetworkRequest,
} from "./network-blocking"

const originalConfigDir = process.env.OPENCODE_CONFIG_DIR

let directory: string | undefined

afterEach(() => {
  if (originalConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
  else process.env.OPENCODE_CONFIG_DIR = originalConfigDir

  if (directory) rmSync(directory, { recursive: true, force: true })

  directory = undefined
})

const cases = [
  { name: "no config file", file: undefined, contents: "", expected: false },
  { name: "missing setting", file: "opencode.json", contents: JSON.stringify({ shell: "/bin/bash" }), expected: false },
  {
    name: "enabled in opencode.json",
    file: "opencode.json",
    contents: JSON.stringify({ block_opencode_claude_network: true }),
    expected: true,
  },
  {
    name: "disabled in opencode.json",
    file: "opencode.json",
    contents: JSON.stringify({ block_opencode_claude_network: false }),
    expected: false,
  },
  {
    name: "enabled in opencode.jsonc with comments",
    file: "opencode.jsonc",
    contents: `{\n  // block network\n  "block_opencode_claude_network": true\n}`,
    expected: true,
  },
] as const

describe("desktop network blocking", () => {
  test.each(cases)("$name", ({ file, contents, expected }) => {
    directory = mkdtempSync(join(tmpdir(), "opencode-network-blocking-"))
    process.env.OPENCODE_CONFIG_DIR = directory

    if (file) writeFileSync(join(directory, file), contents, "utf8")

    expect(shouldBlockNetworkRequest()).toBe(expected)
  })

  test("identifies blocked hosts and urls", () => {
    expect(isBlockedHost("opencode.ai")).toBe(true)
    expect(isBlockedHost("OPENCODE.AI")).toBe(true)
    expect(isBlockedHost("opencode.ai.")).toBe(true)
    expect(isBlockedHost("models.opencode.ai")).toBe(true)
    expect(isBlockedHost("api.opencode.ai")).toBe(true)
    expect(isBlockedHost("claude.ai")).toBe(true)
    expect(isBlockedHost("api.claude.ai")).toBe(true)

    expect(isBlockedHost("notopencode.ai")).toBe(false)
    expect(isBlockedHost("notclaude.ai")).toBe(false)
    expect(isBlockedHost("github.com")).toBe(false)

    expect(isBlockedUrl("https://opencode.ai/")).toBe(true)
    expect(isBlockedUrl("https://models.opencode.ai/api.json")).toBe(true)
    expect(isBlockedUrl("opencode.ai")).toBe(true)
    expect(isBlockedUrl("https://claude.ai/chat")).toBe(true)
    expect(isBlockedUrl("https://github.com/")).toBe(false)
    expect(isBlockedUrl("invalid-url")).toBe(false)
  })

  test("blocks fetch when enabled and allows when disabled", async () => {
    installDesktopFetchBlocker()
    directory = mkdtempSync(join(tmpdir(), "opencode-network-blocking-"))
    process.env.OPENCODE_CONFIG_DIR = directory

    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ok") })

    try {
      expect((await fetch(server.url)).status).toBe(200)

      writeFileSync(join(directory, "opencode.json"), JSON.stringify({ block_opencode_claude_network: true }), "utf8")
      expect(shouldBlockNetworkRequest()).toBe(true)
      await expect(fetch("https://opencode.ai/test")).rejects.toThrow("blocked by configuration")
      await expect(fetch("https://models.opencode.ai/api.json")).rejects.toThrow("blocked by configuration")
      await expect(fetch("https://claude.ai/")).rejects.toThrow("blocked by configuration")

      // Unrelated hosts and loopback still work
      expect((await fetch(server.url)).status).toBe(200)

      writeFileSync(join(directory, "opencode.json"), JSON.stringify({ block_opencode_claude_network: false }), "utf8")
      expect(shouldBlockNetworkRequest()).toBe(false)
    } finally {
      await server.stop(true)
    }
  })
})
