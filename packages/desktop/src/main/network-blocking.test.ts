import { describe, expect, test, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { shouldBlockNetworkRequest } from "./network-blocking"

describe("desktop network blocking", () => {
  const originalConfigDir = process.env.OPENCODE_CONFIG_DIR
  let tempDir: string | undefined

  afterEach(() => {
    if (originalConfigDir !== undefined) {
      process.env.OPENCODE_CONFIG_DIR = originalConfigDir
    } else {
      delete process.env.OPENCODE_CONFIG_DIR
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  test("returns false when no config file exists", () => {
    tempDir = mkdtempSync(join(tmpdir(), "oc-test-"))
    process.env.OPENCODE_CONFIG_DIR = tempDir
    expect(shouldBlockNetworkRequest()).toBe(false)
  })

  test("returns true when block_opencode_claude_network is true in opencode.json", () => {
    tempDir = mkdtempSync(join(tmpdir(), "oc-test-"))
    process.env.OPENCODE_CONFIG_DIR = tempDir
    writeFileSync(
      join(tempDir, "opencode.json"),
      JSON.stringify({ block_opencode_claude_network: true }),
      "utf8",
    )
    expect(shouldBlockNetworkRequest()).toBe(true)
  })

  test("returns false when block_opencode_claude_network is false", () => {
    tempDir = mkdtempSync(join(tmpdir(), "oc-test-"))
    process.env.OPENCODE_CONFIG_DIR = tempDir
    writeFileSync(
      join(tempDir, "opencode.json"),
      JSON.stringify({ block_opencode_claude_network: false }),
      "utf8",
    )
    expect(shouldBlockNetworkRequest()).toBe(false)
  })

  test("returns true when block_opencode_claude_network is true in opencode.jsonc with comments", () => {
    tempDir = mkdtempSync(join(tmpdir(), "oc-test-"))
    process.env.OPENCODE_CONFIG_DIR = tempDir
    writeFileSync(
      join(tempDir, "opencode.jsonc"),
      `{\n  // block network\n  "block_opencode_claude_network": true\n}`,
      "utf8",
    )
    expect(shouldBlockNetworkRequest()).toBe(true)
  })
})
