export * as LocationActivity from "./location-activity.js"

import { Clock, Context, Duration, Effect, Layer, Option, RcMap, Schema } from "effect"
import type { Document } from "@opencode/schema/config"
import type { AbsolutePath } from "@opencode/schema/schema"
import { Bus } from "./bus.js"
import { Config } from "./config.js"
import { Job } from "./job.js"
import { Location } from "./location.js"
import { LocationServiceMap } from "./location-service-map.js"
import { SessionEvent } from "./session/event.js"
import { SessionExecution } from "./session/execution.js"
import { SessionStore } from "./session/store.js"
import { makeGlobalNode } from "@opencode/util/effect/app-node"

const isSessionEvent = Schema.is(SessionEvent.Durable)

export interface Interface {
  /**
   * Shuts down the services loaded for a directory now instead of after the idle timeout, so the server stops holding
   * files and processes inside it. A location whose session is executing or has a running background job is kept.
   * Returns false when a location was kept.
   */
  readonly release: (directory: AbsolutePath) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/LocationActivity") {}

export function layer(options: { readonly timeToLive?: Duration.Input; readonly sweepInterval?: Duration.Input } = {}) {
  return Layer.effect(
    Service,
    Effect.gen(function* () {
      const clock = yield* Clock.Clock
      const bus = yield* Bus.Service
      const locations = yield* LocationServiceMap.Service
      const execution = yield* SessionExecution.Service
      const jobs = yield* Job.Service
      const sessions = yield* SessionStore.Service
      const timeToLive = Duration.fromInputUnsafe(options.timeToLive ?? "60 minutes")
      const entries = new Map<string, { readonly ref: Location.Ref; touchedAt: number }>()
      const key = (ref: Location.Ref) => `${LocationServiceMap.canonical(ref).directory}\0${ref.workspaceID ?? ""}`
      const touch = (ref: Location.Ref) =>
        Effect.sync(() => {
          entries.set(key(ref), { ref, touchedAt: clock.currentTimeMillisUnsafe() })
        })

      // Read per location so project config can override the global value.
      const idleTimeout = (ref: Location.Ref) =>
        Effect.gen(function* () {
          const context = yield* locations.contextEffectOption(ref)
          if (Option.isNone(context)) return timeToLive
          const entries = yield* Context.get(context.value, Config.Service).entries()
          const configured = entries.findLast(
            (entry): entry is Document =>
              entry.type === "document" && entry.info.experimental?.location_idle_timeout !== undefined,
          )
          return configured?.info.experimental?.location_idle_timeout ?? timeToLive
        }).pipe(
          Effect.scoped,
          Effect.orElseSucceed(() => timeToLive),
        )

      // Waiting on a question, a long tool call, or a background job emits no durable activity.
      const occupied = Effect.gen(function* () {
        const owners = [
          ...(yield* execution.active),
          ...(yield* jobs.runningBackground).flatMap((recovery) =>
            recovery.kind === "subagent" ? [recovery.childSessionID, recovery.parentSessionID] : [recovery.sessionID],
          ),
        ]
        return new Set(
          (yield* Effect.forEach(owners, (sessionID) => sessions.get(sessionID))).flatMap((session) =>
            session ? [key(session.location)] : [],
          ),
        )
      })

      const evict = (ref: Location.Ref, reason: "idle" | "released") =>
        Effect.suspend(() => {
          entries.delete(key(ref))
          return Effect.logInfo("location services evicted", {
            directory: ref.directory,
            workspaceID: ref.workspaceID,
            reason,
          }).pipe(Effect.andThen(locations.invalidate(ref)))
        })

      const unsubscribe = yield* bus.listen((event) => {
        if (!isSessionEvent(event) || !event.location) return Effect.void
        const location = LocationServiceMap.canonical(event.location)
        return RcMap.has(locations.rcMap, location).pipe(
          Effect.flatMap((active) => (active ? touch(location) : Effect.void)),
        )
      })
      yield* Effect.addFinalizer(() => unsubscribe)
      yield* Effect.gen(function* () {
        yield* Effect.sleep(options.sweepInterval ?? "1 minute")
        const refs = Array.from(yield* RcMap.keys(locations.rcMap))
        const cached = new Set(refs.map(key))
        yield* Effect.forEach(refs, (ref) => (entries.has(key(ref)) ? Effect.void : touch(ref)), { discard: true })
        for (const id of entries.keys()) {
          if (!cached.has(id)) entries.delete(id)
        }
        const now = clock.currentTimeMillisUnsafe()
        const expired = yield* Effect.filter(Array.from(entries.values()), (entry) =>
          idleTimeout(entry.ref).pipe(
            Effect.map((timeout) => timeout !== false && entry.touchedAt + Duration.toMillis(timeout) <= now),
          ),
        )
        if (expired.length === 0) return
        const busy = yield* occupied
        yield* Effect.forEach(
          expired,
          (entry) => (busy.has(key(entry.ref)) ? touch(entry.ref) : evict(entry.ref, "idle")),
          { discard: true },
        )
      }).pipe(Effect.forever, Effect.forkScoped)

      return Service.of({
        release: (directory) =>
          Effect.gen(function* () {
            // Every placement of the directory: a session can live in a workspace of it.
            const target = LocationServiceMap.canonical(Location.Ref.make({ directory })).directory
            const refs = Array.from(yield* RcMap.keys(locations.rcMap)).filter((ref) => ref.directory === target)
            if (refs.length === 0) return true
            const busy = yield* occupied
            const kept = refs.filter((ref) => busy.has(key(ref)))
            yield* Effect.forEach(
              refs.filter((ref) => !busy.has(key(ref))),
              (ref) => evict(ref, "released"),
              { discard: true },
            )
            return kept.length === 0
          }),
      })
    }),
  )
}

export const node = makeGlobalNode({
  service: Service,
  layer: layer(),
  deps: [Bus.node, Job.node, LocationServiceMap.node, SessionExecution.node, SessionStore.node],
})
