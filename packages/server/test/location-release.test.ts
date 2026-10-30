import { expect } from "bun:test"
import { Effect } from "effect"
import { HttpServer } from "effect/http"
import fs from "node:fs/promises"
import path from "node:path"
import { OpenCode } from "../../client/src/promise/index"
import { initRepo } from "../../core/test/fixture/git"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { ServerProcess } from "../src/process"

// Windows refuses to delete a directory while a process holds a handle inside it, which is the lock users hit.
const windows = process.platform === "win32" ? it.live : it.live.skip

windows(
  "releasing a directory lets it be deleted while the server keeps running",
  () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireDisposable(Effect.promise(() => tmpdir("opencode-location-release-")))
      const directory = path.join(tmp.path, "project")
      yield* Effect.promise(async () => {
        await fs.mkdir(directory)
        await initRepo(directory)
        await fs.writeFile(path.join(directory, "AGENTS.md"), "instructions")
        await fs.writeFile(path.join(directory, "open.ts"), "export {}")
      })
      // Real watchers: they hold the handles that keep the directory locked.
      const server = yield* ServerProcess.start<never, never>({
        hostname: "127.0.0.1",
        port: 0,
        password: "secret",
        app: { version: "test-version" },
        database: { path: ":memory:" },
        config: { directory: path.join(tmp.path, "config") },
        models: { fetch: false },
      })
      const api = OpenCode.make({
        baseUrl: HttpServer.formatAddress(server.address),
        headers: { authorization: `Basic ${btoa("opencode:secret")}` },
      })
      const location = { directory }
      yield* Effect.promise(async () => {
        await api.session.create({ location })
        await api.experimental.file.watch({ location, path: "open.ts" })
        // A terminal's shell runs inside the directory.
        await api.pty.create({ location, command: "cmd.exe", cwd: directory })
        expect(await api.debug.location.list()).toContainEqual({ directory })
        await expect(fs.rm(directory, { recursive: true })).rejects.toThrow()

        expect(await api.location.release({ location })).toEqual({ released: true })
        expect(await api.debug.location.list()).not.toContainEqual({ directory })
        await fs.rm(directory, { recursive: true })

        // A directory with nothing loaded is released without booting it.
        expect(await api.location.release({ location })).toEqual({ released: true })
        expect(await api.debug.location.list()).not.toContainEqual({ directory })
      })
    }),
  60_000,
)
