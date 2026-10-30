import { createEffect, on, onCleanup } from "solid-js"
import { useGlobal } from "@/runtime/server/runtime"
import { pathKey } from "@/workspaces/path-key"
import { tabKey, useTabs, type Tab } from "./tabs"
import type { ServerConnection } from "@/runtime/server/registry"

// Long enough for a tab that closes and reopens on the same folder, such as a draft promoted to a session, to keep it.
const RELEASE_DELAY_MS = 2_000

type Place = { server: ServerConnection.Key; directory: string }

/**
 * Asks the server to release a folder once the last tab using it closes. The server otherwise keeps the folder's
 * services, watchers and terminals for an hour after its last session activity, which on Windows keeps the folder from
 * being deleted. Sessions that are still running keep their folder on the server.
 */
export function useReleaseClosedFolders() {
  const tabs = useTabs()
  const global = useGlobal()
  const pending = new Map<string, ReturnType<typeof setTimeout>>()

  const place = (tab: Tab): Place | undefined => {
    if (tab.type === "draft") {
      // A draft runs in its selected worktree; "main" and "create" mean the project directory.
      const worktree = tab.worktree && tab.worktree !== "main" && tab.worktree !== "create" ? tab.worktree : undefined

      return { server: tab.server, directory: worktree ?? tab.directory }
    }

    const directory =
      global.serverCtx(tab.server)?.data.session.get(tab.sessionId)?.location.directory ??
      tabs.info[tabKey(tab)]?.directory

    return directory ? { server: tab.server, directory } : undefined
  }

  const placeKey = (item: Place) => `${item.server}\n${pathKey(item.directory)}`

  const open = () => {
    if (!tabs.ready()) return

    return new Map(
      tabs.store.flatMap((tab) => {
        const item = place(tab)

        return item ? [[placeKey(item), item] as const] : []
      }),
    )
  }

  const release = (item: Place) => {
    const ctx = global.serverCtx(item.server)

    // Older servers lack the route; the folder then waits for the server's idle timeout as before.
    void ctx?.sdk.api.location.release({ location: { directory: item.directory } }).catch(() => undefined)
  }

  createEffect(
    on(open, (next, previous) => {
      if (!next) return

      for (const key of next.keys()) {
        clearTimeout(pending.get(key))
        pending.delete(key)
      }

      if (!previous) return

      for (const [key, item] of previous) {
        if (next.has(key) || pending.has(key)) continue
        pending.set(
          key,
          setTimeout(() => {
            pending.delete(key)
            release(item)
          }, RELEASE_DELAY_MS),
        )
      }
    }),
  )

  onCleanup(() => pending.forEach(clearTimeout))
}
