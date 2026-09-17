import { createMemo } from "solid-js"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { MAX_HOME_PROJECTS_WIDTH } from "@/context/layout"
import { createHomeController } from "./home/home-controller"
import { createHomeProjectsController } from "./home/home-projects-controller"
import { HomeUtilityNav } from "./home/home-projects-view"
import { HomeProjects } from "./home/home-projects"
import { createHomeScrollController } from "./home/home-scroll-controller"
import { createHomeSessionSearchController } from "./home/home-session-search-controller"
import { createHomeSessionsController } from "./home/home-sessions-controller"
import { HomeSessions } from "./home/home-sessions"

export function NewHome() {
  const home = createHomeController()
  const projects = createHomeProjectsController(home)
  const sessions = createHomeSessionsController(home)
  const search = createHomeSessionSearchController(home, sessions)
  const scroll = createHomeScrollController(sessions.data.groups)
  const maxProjectsWidth = createMemo(() =>
    typeof window !== "undefined"
      ? Math.min(MAX_HOME_PROJECTS_WIDTH, Math.max(300, window.innerWidth - 480))
      : MAX_HOME_PROJECTS_WIDTH,
  )
  return (
    <div
      class={`
        m-2 min-h-0 flex-1 self-stretch overflow-hidden rounded-[10px]
        bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]
      `}
    >
      <ScrollView
        class="h-full [container-type:size]"
        thumbContainer={scroll.viewport.thumbTrack}
        thumbHoverTarget={scroll.viewport.hoverTarget}
        viewportRef={scroll.viewport.setViewport}
        onScroll={(event) => scroll.viewport.update(event.currentTarget.scrollTop)}
        onWheel={scroll.viewport.containOuterWheel}
      >
        <div
          class={`
            home-content-grid mx-auto grid min-h-full w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-4 px-3
            lg:grid-rows-1 lg:gap-8 lg:px-6
          `}
          style={{
            "--home-projects-width": `${home.projectsWidth()}px`,
          }}
        >
          <HomeProjects projects={projects} scroll={scroll} maxProjectsWidth={maxProjectsWidth} />
          <HomeSessions sessions={sessions} search={search} scroll={scroll} />
          <HomeUtilityNav
            class="flex lg:hidden"
            onOpenSettings={projects.utility.settings}
            onOpenHelp={projects.utility.help}
            language={projects.copy.language}
          />
        </div>
      </ScrollView>
    </div>
  )
}
