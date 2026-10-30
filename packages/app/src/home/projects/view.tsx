import { type Accessor, createMemo, For, type JSX, onCleanup, Show, splitProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Popover } from "@kobalte/core/popover"
import {
  displayName,
  getProjectAvatarGenerated,
  getProjectAvatarSource,
  getProjectAvatarVariant,
  ProjectAvatar,
} from "@opencode/ui/project-avatar"
import { Icon } from "@opencode/ui/icon"
import { ResizeHandle } from "@opencode/ui/resize-handle"
import { IconButton } from "@opencode/ui/icon-button"
import { Button } from "@opencode/ui/button"
import { Loader } from "@opencode/ui/loader"
import { Menu } from "@opencode/ui/menu"
import { Tooltip } from "@opencode/ui/tooltip"
import {
  DEFAULT_HOME_PROJECTS_WIDTH,
  type HomeProjectSelection,
  type LocalProject,
  MAX_HOME_PROJECTS_WIDTH,
  MIN_HOME_PROJECTS_WIDTH,
} from "@/shell/state/layout"
import { ServerConnection } from "@/runtime/server/registry"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { ServerRowMenuView, serverMenuLabels } from "@/servers/registry/row-menu"
import { ServerHealthIndicator } from "@/servers/registry/row"
import { type ServerHealth } from "@/runtime/server/health"
import { fileManagerApp } from "@/home/projects/file-manager"
import { CollapsedSidebarToggleSpace } from "@/shell/sidebar-toggle"
import "./view.css"

const HOME_PROJECT_NAV_LABEL = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"

const serverContextMenuID = (server: ServerConnection.Any) => `server:${ServerConnection.key(server)}`

// Plugin servers ask for sign-in themselves; an HTTP server that rejects its saved credentials needs a new
// pairing link or password.
const signInRequired = (server: ServerConnection.Any, health: ServerHealth | undefined) =>
  (server.type === "plugin" && server.authenticationRequired) || (server.type === "http" && !!health?.unauthorized)

const projectContextMenuID = (server: ServerConnection.Any, directory: string) =>
  `project:${ServerConnection.key(server)}:${directory}`

export type HomeProjectsViewProps = {
  dropdown?: boolean
  language: ReturnType<typeof useLanguage>
  servers: ServerConnection.Any[]
  projects: LocalProject[]
  selection: HomeProjectSelection
  projectsWidth?: Accessor<number>
  maxProjectsWidth?: Accessor<number>
  onResizeProjects?: (width: number) => void
  onResetProjectsWidth?: () => void
  serverHealth: (server: ServerConnection.Any) => ServerHealth | undefined
  serverLabel: (server: ServerConnection.Any) => string
  projectsForServer: (server: ServerConnection.Any) => LocalProject[]
  closedProjectsForServer: (server: ServerConnection.Any) => LocalProject[]
  missingProjectsForServer: (server: ServerConnection.Any) => LocalProject[]
  collapsed: (server: ServerConnection.Any) => boolean
  canRevealProject: (server: ServerConnection.Any) => boolean
  hasUnread: (server: ServerConnection.Any, project: LocalProject) => boolean
  onWheel: (event: WheelEvent) => void
  onChooseProject: (server: ServerConnection.Any) => void
  onFocusServer: (server: ServerConnection.Any) => void
  onAuthenticateServer?: (server: ServerConnection.Any) => void
  onToggleCollapsed: (server: ServerConnection.Any) => void
  onEditServer: (server: ServerConnection.Http) => void
  canRemoveServer: (server: ServerConnection.Any) => boolean
  onRemoveServer: (server: ServerConnection.Any) => void
  canHideServer: (server: ServerConnection.Any) => boolean
  onHideServer: (server: ServerConnection.Any) => void
  onSelectProject: (server: ServerConnection.Any, directory: string) => void
  onOpenProjectNewSession: (server: ServerConnection.Any, directory: string) => void
  canImportSession: boolean
  onImportSession: (server: ServerConnection.Any, project: LocalProject) => void
  onEditProject: (server: ServerConnection.Any, project: LocalProject) => void
  onRevealProject: (server: ServerConnection.Any, project: LocalProject) => void
  onClearNotifications: (server: ServerConnection.Any, project: LocalProject) => void
  onHideProject: (server: ServerConnection.Any, project: LocalProject) => void
  onReopenProject: (server: ServerConnection.Any, project: LocalProject) => void
  onOpenSettings: () => void
  onOpenHelp: () => void
}

export function HomeProjectsView(props: HomeProjectsViewProps) {
  const [state, setState] = createStore({ open: false })

  const server = createMemo(() =>
    props.servers.find((server) => ServerConnection.key(server) === props.selection.server),
  )

  const selected = createMemo(() => {
    const conn = server()
    const match = (project: LocalProject) => project.worktree === props.selection.directory

    return (
      props.projects.find(match) ??
      (conn
        ? (props.closedProjectsForServer(conn).find(match) ?? props.missingProjectsForServer(conn).find(match))
        : undefined)
    )
  })

  return (
    <Show when={props.dropdown} fallback={<HomeProjectsPanel {...props} />}>
      <Popover
        open={state.open}
        onOpenChange={(open) => setState("open", open)}
        placement="bottom-start"
        sameWidth
        gutter={6}
      >
        <Popover.Trigger
          data-component="home-projects-dropdown"
          aria-label={props.language.t("home.projects")}
          class="flex h-10 w-full min-w-0 items-center gap-2 rounded-[6px] bg-v2-background-bg-base px-1.5 text-start text-v2-text-text-base outline-none hover:bg-v2-background-bg-layer-01"
        >
          <Show when={selected()} fallback={<Icon name="folder" size="small" />}>
            {(project) => <HomeProjectAvatar project={project()} />}
          </Show>
          <span class="flex min-w-0 flex-1 flex-col leading-[var(--line-height-compact)]">
            <bdi class="truncate">
              <Show when={selected()} fallback={props.language.t("home.projects.all")}>
                {(project) => displayName(project())}
              </Show>
            </bdi>
            <Show when={props.servers.length > 1 && server()}>
              {(server) => <bdi class="truncate text-v2-text-text-muted opacity-70">{props.serverLabel(server())}</bdi>}
            </Show>
          </span>
          <Icon name="chevron-down" size="small" class="shrink-0 text-v2-icon-icon-muted" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            aria-label={props.language.t("home.projects")}
            dir={props.language.direction()}
            class="z-50 max-h-[min(70dvh,var(--kb-popper-content-available-height))] overflow-hidden rounded-[10px] bg-v2-background-bg-base p-1.5 shadow-[var(--v2-elevation-floating)] outline-none data-[expanded]:animate-in data-[expanded]:fade-in data-[expanded]:slide-in-from-top-2 duration-150 ease-out motion-reduce:animate-none"
          >
            <HomeProjectsPanel
              {...props}
              onSelectProject={(server, directory) => {
                props.onSelectProject(server, directory)
                setState("open", false)
              }}
              onFocusServer={(server) => {
                props.onFocusServer(server)
                setState("open", false)
              }}
              onAuthenticateServer={(server) => {
                setState("open", false)
                props.onAuthenticateServer?.(server)
              }}
              onChooseProject={(server) => {
                setState("open", false)
                props.onChooseProject(server)
              }}
              onOpenProjectNewSession={(server, directory) => {
                setState("open", false)
                props.onOpenProjectNewSession(server, directory)
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </Show>
  )
}

function HomeProjectsPanel(props: HomeProjectsViewProps) {
  // `missing` holds the servers whose Missing section is expanded; each starts collapsed.
  const [state, setState] = createStore<{ open: string | undefined; search: string; missing: Record<string, boolean> }>(
    { open: undefined, search: "", missing: {} },
  )

  const query = () => state.search.trim()
  const searching = () => query().length > 0

  const matches = (project: LocalProject) => {
    const value = query().toLowerCase()

    return !value || displayName(project).toLowerCase().includes(value)
  }

  const visible = (items: LocalProject[]) => (searching() ? items.filter(matches) : items)

  // A search shows the matching missing projects.
  const missingProps = (server: ServerConnection.Any) => ({
    items: visible(props.missingProjectsForServer(server)),
    expanded: searching() || !!state.missing[ServerConnection.key(server)],
    onToggle: () => setState("missing", ServerConnection.key(server), (expanded) => !expanded),
  })

  // A search spans every added project, so servers without a match step aside and
  // collapsed servers expand for their matching projects.
  const visibleServers = () =>
    searching()
      ? props.servers.filter(
          (server) =>
            visible(props.projectsForServer(server)).length > 0 ||
            visible(props.closedProjectsForServer(server)).length > 0 ||
            visible(props.missingProjectsForServer(server)).length > 0,
        )
      : props.servers

  const contextMenuProps = {
    contextMenuOpen: (id: string) => state.open === id,
    onSetContextMenuOpen: (id: string, open: boolean) => setState("open", open ? id : undefined),
  }

  return (
    <aside
      class={
        props.dropdown
          ? "flex max-h-[min(60dvh,calc(var(--kb-popper-content-available-height)-12px))] min-h-0 min-w-0 flex-col overflow-hidden"
          : `
        relative mt-2.5 flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden lg:overflow-visible
        lg:sticky lg:top-14 lg:mt-14 lg:h-[calc(100cqh-56px)] lg:self-start lg:pt-[52px]
      `
      }
      aria-label={props.language.t("home.projects")}
      onWheel={(event) => {
        if (event.target === event.currentTarget) return
        props.onWheel(event)
      }}
    >
      <Show when={!props.dropdown}>
        <div class="flex h-7 min-w-0 shrink-0 items-center justify-between ps-1.5 pe-3">
          {/* Below lg, Projects heads the page on the collapsed sidebar toggle's line. Starting the space at the row's
              edge (the shell's 8px inset plus the grid's 12px padding) keeps the row's 6px padding after the toggle,
              which lines the label up with the icons that follow it in the session and settings headers. */}
          <div class="flex min-w-0 items-center">
            <CollapsedSidebarToggleSpace start={20} class="lg:hidden" />
            <div class="text-v2-text-text-muted [font-weight:530]">{props.language.t("home.projects")}</div>
          </div>
          <Show when={props.servers.length === 1}>
            <Tooltip placement="bottom" value={props.language.t("home.project.add")}>
              <IconButton
                data-action="home-add-project"
                variant="ghost-muted"
                size="large"
                class="titlebar-icon [&_[data-slot=icon-svg]]:text-v2-icon-icon-muted"
                icon={<Icon name="folder-add-left" />}
                disabled={props.serverHealth(props.servers[0])?.healthy === false}
                onClick={() => props.onChooseProject(props.servers[0])}
                aria-label={props.language.t("home.project.add")}
              />
            </Tooltip>
          </Show>
        </div>
      </Show>
      <div
        data-component="home-project-search"
        class={`
          flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-[6px] bg-v2-background-bg-layer-02/60 px-2
          text-v2-icon-icon-muted transition-[background-color] duration-[120ms] ease-in-out
          focus-within:bg-v2-background-bg-layer-02 ${props.dropdown ? "" : "me-3"}
        `}
      >
        <Icon name="magnifying-glass" size="small" class="shrink-0" />
        <input
          class={`
            min-w-0 flex-1 border-0 bg-transparent text-[13px] leading-[var(--line-height-compact)] tracking-[-0.04px]
            text-v2-text-text-base [font-weight:440] outline-none placeholder:text-v2-text-text-faint
          `}
          type="text"
          value={state.search}
          placeholder={props.language.t("home.projects.search.placeholder")}
          aria-label={props.language.t("home.projects.search.placeholder")}
          onInput={(event) => setState("search", event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return

            event.preventDefault()
            setState("search", "")
            event.currentTarget.blur()
          }}
        />
        <Show when={searching()}>
          <IconButton
            type="button"
            variant="ghost-muted"
            size="small"
            class="shrink-0"
            icon={<Icon name="close" size="large" class="text-v2-icon-icon-muted" />}
            aria-label={props.language.t("common.clear")}
            onClick={() => setState("search", "")}
          />
        </Show>
      </div>
      <div data-slot="home-projects-scroll" class="relative flex min-h-0 min-w-0 shrink flex-col">
        <div data-slot="home-projects-viewport" data-scrollable class="min-h-0 flex-1 overflow-y-auto">
          <Show when={props.dropdown && props.servers.length === 1}>
            <HomeProjectNavButton
              type="button"
              class="mb-1"
              data-selected={!props.selection.directory ? "" : undefined}
              onClick={() => props.onFocusServer(props.servers[0])}
            >
              <Icon name="folder" size="small" />
              <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("home.projects.all")}</span>
            </HomeProjectNavButton>
          </Show>
          <Show
            when={
              props.servers.length > 1 ||
              props.servers.some(
                (server) =>
                  signInRequired(server, props.serverHealth(server)) || (server.type === "plugin" && server.connecting),
              )
            }
            fallback={
              <Show when={props.servers[0]}>
                {(server) => (
                  <div class={props.dropdown ? "" : "pe-3"}>
                    <Show
                      when={
                        props.projects.length > 0 || props.closedProjectsForServer(server()).length > 0 || searching()
                      }
                      fallback={<HomeProjectEmpty {...props} server={server()} />}
                    >
                      <Show
                        when={
                          visible(props.projects).length > 0 ||
                          visible(props.closedProjectsForServer(server())).length > 0 ||
                          visible(props.missingProjectsForServer(server())).length > 0
                        }
                        fallback={<HomeProjectNoMatch language={props.language} query={query()} />}
                      >
                        <div class="flex min-w-0 flex-col gap-1">
                          <Show when={visible(props.projects).length > 0}>
                            <HomeProjectList
                              {...props}
                              {...contextMenuProps}
                              server={server()}
                              items={visible(props.projects)}
                            />
                          </Show>
                          <Show when={visible(props.closedProjectsForServer(server())).length > 0}>
                            <HomeProjectList
                              {...props}
                              {...contextMenuProps}
                              server={server()}
                              items={visible(props.closedProjectsForServer(server()))}
                              closed
                            />
                          </Show>
                        </div>
                      </Show>
                      <Show when={props.dropdown}>
                        <HomeProjectNavButton
                          type="button"
                          data-action="home-add-project-row"
                          class="mt-1 disabled:opacity-60"
                          disabled={props.serverHealth(server())?.healthy === false}
                          onClick={() => props.onChooseProject(server())}
                        >
                          <Icon name="folder-add-left" size="small" />
                          <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("home.project.add")}</span>
                        </HomeProjectNavButton>
                      </Show>
                    </Show>
                    <HomeMissingProjects
                      {...props}
                      {...contextMenuProps}
                      {...missingProps(server())}
                      class="mt-1"
                      server={server()}
                    />
                  </div>
                )}
              </Show>
            }
          >
            <Show
              when={!searching() || visibleServers().length > 0}
              fallback={<HomeProjectNoMatch language={props.language} query={query()} />}
            >
              <div class={`flex min-w-0 flex-col ${props.dropdown ? "gap-1" : "gap-4 pe-3"}`}>
                <For each={visibleServers()}>
                  {(item) => {
                    const projects = () => visible(props.projectsForServer(item))
                    const closed = () => visible(props.closedProjectsForServer(item))
                    const missing = () => visible(props.missingProjectsForServer(item))
                    const healthy = () => !!props.serverHealth(item)?.healthy
                    const hasProjects = () => projects().length > 0 || closed().length > 0 || missing().length > 0
                    const collapsed = () => props.collapsed(item)
                    const authentication = () => signInRequired(item, props.serverHealth(item))
                    const connecting = () => item.type === "plugin" && item.connecting

                    return (
                      <div class="flex min-w-0 flex-col gap-1">
                        <HomeServerRow
                          server={item}
                          {...props}
                          {...contextMenuProps}
                          selected={props.selection.server === ServerConnection.key(item) && !props.selection.directory}
                          collapsed={collapsed()}
                          health={props.serverHealth(item)}
                        />
                        <Show when={authentication() || connecting()}>
                          <div class="mx-3 h-px bg-v2-border-border-base" />
                          <div class="px-1.5 py-1">
                            <Button
                              data-action="home-server-authenticate"
                              class="w-full"
                              size="small"
                              variant="neutral"
                              disabled={connecting()}
                              aria-busy={!!connecting()}
                              onClick={() => props.onAuthenticateServer?.(item)}
                            >
                              <Show when={connecting()}>
                                <Loader class="size-3.5" />
                              </Show>
                              {props.language.t(
                                connecting() ? "server.status.connecting" : "server.action.authenticate",
                              )}
                            </Button>
                          </div>
                        </Show>
                        <Show
                          when={
                            healthy() &&
                            !authentication() &&
                            !connecting() &&
                            hasProjects() &&
                            (!collapsed() || searching())
                          }
                        >
                          <div class="mx-3 h-px bg-v2-border-border-base" />
                          <Show when={projects().length > 0}>
                            <HomeProjectList {...props} {...contextMenuProps} server={item} items={projects()} />
                          </Show>
                          <Show when={closed().length > 0}>
                            <HomeProjectList {...props} {...contextMenuProps} server={item} items={closed()} closed />
                          </Show>
                          <HomeMissingProjects {...props} {...contextMenuProps} {...missingProps(item)} server={item} />
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </div>
      <HomeUtilityNav
        class="mb-8 mt-4 hidden shrink-0 lg:flex"
        onOpenSettings={props.onOpenSettings}
        onOpenHelp={props.onOpenHelp}
        language={props.language}
      />
      <Show when={!props.dropdown && props.onResizeProjects}>
        {(onResize) => (
          <div data-slot="home-projects-resize" class="hidden lg:block">
            <div data-slot="home-projects-resize-line" />
            <ResizeHandle
              direction="horizontal"
              size={props.projectsWidth?.() ?? DEFAULT_HOME_PROJECTS_WIDTH}
              min={MIN_HOME_PROJECTS_WIDTH}
              max={props.maxProjectsWidth?.() ?? MAX_HOME_PROJECTS_WIDTH}
              onResize={onResize()}
              onDblClick={() => props.onResetProjectsWidth?.()}
            />
          </div>
        )}
      </Show>
    </aside>
  )
}

export function HomeUtilityNav(props: {
  class?: string
  onOpenSettings: () => void
  onOpenHelp: () => void
  language: ReturnType<typeof useLanguage>
}) {
  return (
    <div
      class={`${props.class ?? ""} min-w-0 flex-row justify-between gap-1 lg:flex-col lg:justify-start lg:pe-3 [&>button]:w-auto lg:[&>button]:w-full`}
    >
      <HomeProjectNavButton
        type="button"
        class="text-v2-text-text-faint [&>[data-slot=icon-svg]]:text-v2-icon-icon-muted"
        onClick={props.onOpenSettings}
      >
        <Icon name="settings-gear" size="small" />
        <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("sidebar.settings")}</span>
      </HomeProjectNavButton>
      <HomeProjectNavButton
        type="button"
        class="text-v2-text-text-faint [&>[data-slot=icon-svg]]:text-v2-icon-icon-muted"
        onClick={props.onOpenHelp}
      >
        <Icon name="help" size="small" />
        <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("sidebar.help")}</span>
      </HomeProjectNavButton>
    </div>
  )
}

function HomeServerRow(props: {
  language: HomeProjectsViewProps["language"]
  serverLabel: HomeProjectsViewProps["serverLabel"]
  projectsForServer: HomeProjectsViewProps["projectsForServer"]
  closedProjectsForServer: HomeProjectsViewProps["closedProjectsForServer"]
  missingProjectsForServer: HomeProjectsViewProps["missingProjectsForServer"]
  contextMenuOpen: HomeProjectsContextMenuProps["contextMenuOpen"]
  onFocusServer: HomeProjectsViewProps["onFocusServer"]
  onToggleCollapsed: HomeProjectsViewProps["onToggleCollapsed"]
  onEditServer: HomeProjectsViewProps["onEditServer"]
  canRemoveServer: HomeProjectsViewProps["canRemoveServer"]
  onRemoveServer: HomeProjectsViewProps["onRemoveServer"]
  canHideServer: HomeProjectsViewProps["canHideServer"]
  onHideServer: HomeProjectsViewProps["onHideServer"]
  onSetContextMenuOpen: HomeProjectsContextMenuProps["onSetContextMenuOpen"]
  onChooseProject: HomeProjectsViewProps["onChooseProject"]
  server: ServerConnection.Any
  selected: boolean
  collapsed: boolean
  health: ServerHealth | undefined
}) {
  const healthy = () => !!props.health?.healthy
  const authentication = () => signInRequired(props.server, props.health)
  const incompatible = () => !!props.health?.incompatible

  const canToggle = () =>
    healthy() &&
    (props.projectsForServer(props.server).length > 0 ||
      props.closedProjectsForServer(props.server).length > 0 ||
      props.missingProjectsForServer(props.server).length > 0)

  const contextMenuID = () => serverContextMenuID(props.server)
  onCleanup(() => {
    const id = contextMenuID()

    if (props.contextMenuOpen(id)) props.onSetContextMenuOpen(id, false)
  })

  return (
    <Tooltip
      appearance="large"
      contentClass="max-w-80 break-words"
      placement="top"
      class="flex h-7 w-full min-w-0"
      inactive={!incompatible() && !authentication()}
      value={
        authentication()
          ? props.language.t("server.status.authentication")
          : props.language.t("server.row.incompatible", { version: props.health?.version ?? "1" })
      }
    >
      <div
        class="group/server relative flex h-7 w-full min-w-0 items-center rounded-[6px]"
        data-home-row
        data-dimmed={!healthy() && !incompatible()}
        data-selected={props.selected ? "" : undefined}
      >
        <HomeProjectNavButton
          type="button"
          data-selected={props.selected ? "" : undefined}
          disabled={!healthy() && !authentication()}
          onClick={() => props.onFocusServer(props.server)}
        >
          <span
            data-action="home-server-collapse"
            class={`
            -ms-0.5 -me-1.5 inline-flex size-5 shrink-0 items-center justify-center
            rounded-[4px] text-v2-icon-icon-muted
          `}
            classList={{
              "hover:bg-v2-overlay-simple-overlay-hover": canToggle(),
              "cursor-default opacity-40": !canToggle(),
            }}
            aria-label={
              props.collapsed ? props.language.t("home.server.expand") : props.language.t("home.server.collapse")
            }
            aria-disabled={!canToggle()}
            aria-expanded={canToggle() ? !props.collapsed : undefined}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()

              if (!canToggle()) return
              props.onToggleCollapsed(props.server)
            }}
            onPointerDown={(event) => event.preventDefault()}
          >
            <Icon
              name="chevron-down"
              size="small"
              class="transition-transform duration-150 ease-in-out"
              style={{ transform: `rotate(${props.collapsed || !canToggle() ? -90 : 0}deg)` }}
            />
          </span>
          <div class="flex size-4 shrink-0 items-center justify-center -me-0.5">
            <ServerHealthIndicator
              health={props.health}
              connecting={props.server.type === "plugin" && props.server.connecting}
              authenticationRequired={authentication()}
            />
          </div>
          <span
            data-slot="home-row-label"
            class="flex min-w-0 flex-1 items-center gap-1"
            classList={{ "opacity-60": !healthy() && !incompatible() }}
          >
            <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {props.serverLabel(props.server)}
            </span>
            <Show when={props.server.label}>
              {(label) => (
                <span
                  class={`
                  shrink-0 rounded-[3px] border border-v2-border-border-base px-1 py-0.5
                  text-[9px] leading-none text-v2-text-text-muted
                `}
                >
                  {label()}
                </span>
              )}
            </Show>
          </span>
        </HomeProjectNavButton>
        <div
          data-slot="home-row-actions"
          class={`
          hover-reveal absolute bottom-0 end-1 top-0 flex items-center gap-1 rounded-e-[6px] ps-2
          group-hover/server:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100
        `}
          data-menu={props.contextMenuOpen(contextMenuID())}
        >
          <ServerRowMenuView
            server={props.server}
            labels={serverMenuLabels(props.language)}
            canRemove={props.canRemoveServer(props.server)}
            canHide={props.canHideServer(props.server)}
            onEdit={props.onEditServer}
            onRemove={() => props.onRemoveServer(props.server)}
            onHide={() => props.onHideServer(props.server)}
            open={props.contextMenuOpen(contextMenuID())}
            onOpenChange={(open) => props.onSetContextMenuOpen(contextMenuID(), open)}
          />
          <Tooltip class="flex shrink-0 items-center" placement="bottom" value={props.language.t("home.project.add")}>
            <IconButton
              data-action="home-add-project"
              variant="ghost-muted"
              size="small"
              icon={<Icon name="folder-add-left" />}
              aria-label={props.language.t("home.project.add")}
              disabled={props.health?.healthy === false && !authentication()}
              onClick={() => props.onChooseProject(props.server)}
            />
          </Tooltip>
        </div>
      </div>
    </Tooltip>
  )
}

type HomeProjectsContextMenuProps = {
  contextMenuOpen: (id: string) => boolean
  onSetContextMenuOpen: (id: string, open: boolean) => void
}

type HomeProjectListProps = HomeProjectsViewProps &
  HomeProjectsContextMenuProps & {
    server: ServerConnection.Any
    items: LocalProject[]
    // Closed rows render dimmed with a Closed label; they stay selectable and reopen from their menu.
    closed?: boolean
    // Missing rows, whose folders are gone, render dimmed with a Missing label and stay selectable for their sessions.
    missing?: boolean
  }

// The projects whose folders are gone, which the server archived, behind a toggle that starts collapsed.
function HomeMissingProjects(
  props: HomeProjectListProps & { expanded: boolean; onToggle: () => void; class?: string },
) {
  return (
    <Show when={props.items.length > 0}>
      <div data-component="home-missing-projects" class={`flex min-w-0 flex-col gap-1 ${props.class ?? ""}`}>
        <HomeProjectNavButton
          type="button"
          data-action="home-missing-toggle"
          aria-expanded={props.expanded}
          onClick={() => props.onToggle()}
        >
          <Icon
            name="chevron-down"
            size="small"
            class="shrink-0 text-v2-icon-icon-muted transition-transform duration-150 ease-in-out"
            style={{ transform: `rotate(${props.expanded ? 0 : -90}deg)` }}
          />
          <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("home.projects.missing")}</span>
          <span class="shrink-0 tabular-nums text-v2-text-text-faint">{props.items.length}</span>
        </HomeProjectNavButton>
        <Show when={props.expanded}>
          <HomeProjectList {...props} missing />
        </Show>
      </div>
    </Show>
  )
}

function HomeProjectList(props: HomeProjectListProps) {
  const [hover, setHover] = createStore({ active: false })

  // The server orders projects by recent activity. While the pointer is over the list, rows keep their places so
  // nothing moves under the cursor; new projects join at the end and the server order returns on leave.
  const worktrees = createMemo<string[]>((previous) => {
    const next = props.items.map((project) => project.worktree)

    if (!hover.active) return next
    const present = new Set(next)
    const kept = previous.filter((worktree) => present.has(worktree))
    const known = new Set(kept)

    return [...kept, ...next.filter((worktree) => !known.has(worktree))]
  }, [])

  return (
    <div
      class="flex min-w-0 flex-col gap-1"
      onPointerEnter={() => setHover("active", true)}
      onPointerLeave={() => setHover("active", false)}
    >
      {/* Keyed on worktree strings: the project objects are recreated on every sync update, so iterating them
          directly would remount every row. */}
      <For each={worktrees()}>{(worktree) => <HomeProjectSlot {...props} worktree={worktree} />}</For>
    </div>
  )
}

function HomeProjectSlot(props: HomeProjectListProps & { worktree: string }) {
  const initial = props.items.find((item) => item.worktree === props.worktree)

  if (!initial) return

  const project = createMemo<LocalProject>(
    (previous) => props.items.find((item) => item.worktree === props.worktree) ?? previous,
    initial,
  )

  return (
    <HomeProjectRow
      {...props}
      project={project()}
      server={props.server}
      selected={
        props.selection.server === ServerConnection.key(props.server) && props.selection.directory === props.worktree
      }
      unread={props.hasUnread(props.server, project())}
    />
  )
}

function HomeProjectNoMatch(props: { language: HomeProjectsViewProps["language"]; query: string }) {
  return (
    <div class="px-1.5 py-2 text-[13px] leading-[var(--line-height-compact)] tracking-[-0.04px] text-v2-text-text-muted [font-weight:440]">
      {props.language.t("home.projects.search.noResults", { query: props.query })}
    </div>
  )
}

function HomeProjectEmpty(props: HomeProjectsViewProps & { server: ServerConnection.Any }) {
  const unreachable = () => props.serverHealth(props.server)?.healthy === false

  return (
    <HomeProjectNavButton
      type="button"
      data-action="home-add-project-row"
      class="disabled:opacity-60 [&>[data-slot=icon-svg]]:text-v2-icon-icon-muted"
      disabled={unreachable()}
      onClick={() => props.onChooseProject(props.server)}
    >
      <Icon name="folder-add-left" size="small" />
      <span class={HOME_PROJECT_NAV_LABEL}>{props.language.t("home.project.add")}</span>
    </HomeProjectNavButton>
  )
}

function HomeProjectRow(
  props: HomeProjectsViewProps &
    HomeProjectsContextMenuProps & {
      project: LocalProject
      server: ServerConnection.Any
      selected: boolean
      unread: boolean
      closed?: boolean
      missing?: boolean
    },
) {
  const platform = usePlatform()
  const serverUnreachable = () => props.serverHealth(props.server)?.healthy === false

  const contextMenuID = () => projectContextMenuID(props.server, props.project.worktree)
  onCleanup(() => {
    const id = contextMenuID()

    if (props.contextMenuOpen(id)) props.onSetContextMenuOpen(id, false)
  })

  return (
    <div
      class="group/project relative flex h-7 min-w-0 items-center rounded-[6px]"
      classList={{ "opacity-60": props.closed || props.missing }}
      data-home-row
      data-dimmed={serverUnreachable()}
      data-closed={props.closed ? "" : undefined}
      data-missing={props.missing ? "" : undefined}
      data-selected={props.selected ? "" : undefined}
      onContextMenu={(event) => {
        event.preventDefault()
        props.onSetContextMenuOpen(contextMenuID(), true)
      }}
    >
      <HomeProjectNavButton
        type="button"
        data-component="home-project-row"
        class="disabled:opacity-60"
        data-selected={props.selected ? "" : undefined}
        aria-current={props.selected ? "page" : undefined}
        disabled={serverUnreachable()}
        onClick={() => props.onSelectProject(props.server, props.project.worktree)}
      >
        <HomeProjectAvatar project={props.project} />
        <span
          data-slot="home-row-label"
          class="flex min-w-0 flex-1 items-center gap-1"
          title={displayName(props.project)}
        >
          <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{displayName(props.project)}</span>
          <Show when={props.closed || props.missing}>
            <span
              class={`
                shrink-0 rounded-[3px] border border-v2-border-border-base px-1 py-0.5
                text-[9px] leading-none text-v2-text-text-muted
              `}
            >
              {props.language.t(props.missing ? "home.project.missing" : "home.project.closed")}
            </span>
          </Show>
        </span>
      </HomeProjectNavButton>
      {/* A missing project's folder is gone, so none of its row actions apply. */}
      <Show when={!props.missing}>
        <div
          data-slot="home-row-actions"
          class={`
          hover-reveal absolute bottom-0 end-1 top-0 flex items-center gap-1 rounded-e-[6px] ps-2
          group-hover/project:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100
        `}
          data-menu={props.contextMenuOpen(contextMenuID())}
        >
          <Menu
            gutter={6}
            modal={false}
            placement="bottom-end"
            open={props.contextMenuOpen(contextMenuID())}
            onOpenChange={(open) => props.onSetContextMenuOpen(contextMenuID(), open)}
          >
            <Menu.Trigger
              as={IconButton}
              data-action="home-project-menu"
              variant="ghost-muted"
              size="small"
              icon={<Icon name="outline-dots" />}
              aria-label={props.language.t("common.moreOptions")}
            />
            <Menu.Portal>
              <Menu.Content>
                <Menu.Item onSelect={() => props.onOpenProjectNewSession(props.server, props.project.worktree)}>
                  {props.language.t("command.session.new")}
                </Menu.Item>
                <Show when={props.canImportSession}>
                  <Menu.Item onSelect={() => props.onImportSession(props.server, props.project)}>
                    {props.language.t("command.session.import")}
                  </Menu.Item>
                </Show>
                <Menu.Item onSelect={() => props.onEditProject(props.server, props.project)}>
                  {props.language.t("dialog.project.edit.title")}
                </Menu.Item>
                <Show when={props.canRevealProject(props.server)}>
                  <Menu.Item onSelect={() => props.onRevealProject(props.server, props.project)}>
                    {props.language.t(
                      fileManagerApp(platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown")
                        .actionLabel,
                    )}
                  </Menu.Item>
                </Show>
                <Menu.Item
                  disabled={!props.unread}
                  onSelect={() => props.onClearNotifications(props.server, props.project)}
                >
                  {props.language.t("sidebar.project.clearNotifications")}
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item
                  onSelect={() =>
                    props.closed
                      ? props.onReopenProject(props.server, props.project)
                      : props.onHideProject(props.server, props.project)
                  }
                >
                  {props.language.t(props.closed ? "command.project.open" : "common.close")}
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
          <IconButton
            data-action="home-project-new-session"
            variant="ghost-muted"
            size="small"
            icon={<Icon name="edit" />}
            aria-label={props.language.t("command.session.new")}
            onClick={() => props.onOpenProjectNewSession(props.server, props.project.worktree)}
          />
        </div>
      </Show>
    </div>
  )
}

function HomeProjectNavButton(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [local, rest] = splitProps(props, ["class", "classList", "children"])

  return (
    <button
      {...rest}
      class={`
        flex h-7 min-w-0 w-full shrink-0 cursor-default items-center gap-2 rounded-[6px] bg-transparent px-1.5 text-start
        text-v2-text-text-muted [font-weight:440] transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out
        hover:bg-v2-background-bg-layer-01 hover:text-v2-text-text-base
        data-[selected]:bg-v2-background-bg-layer-03 data-[selected]:text-v2-text-text-base
        data-[selected]:hover:bg-v2-background-bg-layer-03
        focus-visible:bg-v2-background-bg-layer-01 focus-visible:text-v2-text-text-base focus-visible:outline-none
        focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]
        ${local.class ?? ""}
      `}
      classList={local.classList}
    >
      {local.children}
    </button>
  )
}

function HomeProjectAvatar(props: { project: LocalProject; outline?: boolean }) {
  const name = createMemo(() => displayName(props.project))

  return (
    <ProjectAvatar
      fallback={name()}
      src={props.outline ? undefined : getProjectAvatarSource(props.project.id, props.project.icon)}
      variant={props.outline ? "outline" : getProjectAvatarVariant(props.project.icon?.color)}
      generated={props.outline ? undefined : getProjectAvatarGenerated(props.project)}
    />
  )
}
