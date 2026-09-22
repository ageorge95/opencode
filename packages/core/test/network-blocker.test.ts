import { describe, expect, test } from "bun:test"
import {
  isBlockedHost,
  isBlockedUrl,
  isNetworkBlockerEnabled,
  setNetworkBlockerEnabled,
  installGlobalFetchBlocker,
} from "@opencode-ai/core/network-blocker"

describe("network-blocker", () => {
  test("identifies blocked hosts correctly", () => {
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
    expect(isBlockedHost("anthropic.com")).toBe(false)
    expect(isBlockedHost("github.com")).toBe(false)
    expect(isBlockedHost("google.com")).toBe(false)
  })

  test("identifies blocked urls correctly", () => {
    expect(isBlockedUrl("https://opencode.ai/")).toBe(true)
    expect(isBlockedUrl("https://models.opencode.ai/api.json")).toBe(true)
    expect(isBlockedUrl("http://claude.ai/chat")).toBe(true)
    expect(isBlockedUrl("https://api.claude.ai/v1")).toBe(true)
    expect(isBlockedUrl(new URL("https://opencode.ai/docs"))).toBe(true)

    expect(isBlockedUrl("https://api.anthropic.com/v1/messages")).toBe(false)
    expect(isBlockedUrl("https://github.com/anomalyco/opencode")).toBe(false)
    expect(isBlockedUrl("invalid-url")).toBe(false)
  })

  test("blocks global fetch when enabled", async () => {
    installGlobalFetchBlocker()
    setNetworkBlockerEnabled(false)
    expect(isNetworkBlockerEnabled()).toBe(false)

    // Enable blocker
    setNetworkBlockerEnabled(true)
    expect(isNetworkBlockerEnabled()).toBe(true)

    // Fetching blocked host throws error
    expect(fetch("https://opencode.ai/test")).rejects.toThrow("blocked by configuration")
    expect(fetch("https://models.opencode.ai/api.json")).rejects.toThrow("blocked by configuration")
    expect(fetch("https://claude.ai/")).rejects.toThrow("blocked by configuration")

    // Disable blocker again
    setNetworkBlockerEnabled(false)
    expect(isNetworkBlockerEnabled()).toBe(false)
  })
})
