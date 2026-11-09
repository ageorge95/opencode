import { Show } from "solid-js"
import { Menu } from "@opencode/ui/menu"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import type { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import { fileManagerApp } from "./file-manager"

export function ProjectMenuItems(props: {
  server: ServerConnection.Any
  project: LocalProject
  unread: boolean
  canImportSession: boolean
  importingSession?: boolean
  canRevealProject: (server: ServerConnection.Any) => boolean
  onOpenProjectNewSession: (server: ServerConnection.Any, directory: string) => void
  onImportSession: (server: ServerConnection.Any, project: LocalProject) => void
  onEditProject: (server: ServerConnection.Any, project: LocalProject) => void
  onRevealProject: (server: ServerConnection.Any, project: LocalProject) => void
  onClearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  onHideProject: (server: ServerConnection.Any, project: LocalProject) => void
  /** A closed project reopens from its menu instead of closing. */
  closed?: boolean
  onReopenProject?: (server: ServerConnection.Any, project: LocalProject) => void
}) {
  const language = useLanguage()

  const platform = usePlatform()

  return (
    <>
      <Menu.Item onSelect={() => props.onOpenProjectNewSession(props.server, props.project.worktree)}>
        {language.t("command.session.new")}
      </Menu.Item>
      <Show when={props.canImportSession}>
        <Menu.Item
          disabled={props.importingSession}
          onSelect={() => props.onImportSession(props.server, props.project)}
        >
          {language.t("command.session.import")}
        </Menu.Item>
      </Show>
      <Menu.Item onSelect={() => props.onEditProject(props.server, props.project)}>
        {language.t("dialog.project.edit.title")}
      </Menu.Item>
      <Show when={props.canRevealProject(props.server)}>
        <Menu.Item onSelect={() => props.onRevealProject(props.server, props.project)}>
          {language.t(
            fileManagerApp(platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown").actionLabel,
          )}
        </Menu.Item>
      </Show>
      <Menu.Item disabled={!props.unread} onSelect={() => props.onClearNotifications(props.server, props.project)}>
        {language.t("sidebar.project.clearNotifications")}
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item
        onSelect={() =>
          props.closed
            ? props.onReopenProject?.(props.server, props.project)
            : props.onHideProject(props.server, props.project)
        }
      >
        {language.t(props.closed ? "command.project.open" : "common.close")}
      </Menu.Item>
    </>
  )
}
