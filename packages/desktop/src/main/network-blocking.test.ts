import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { shouldBlockNetworkRequest } from "./network-blocking"

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
})
