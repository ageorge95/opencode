import { FileWatch } from "@opencode/core/filesystem/file-watch"
import { Location } from "@opencode/core/location"
import { LocationActivity } from "@opencode/core/location-activity"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { ServiceUnavailableError } from "@opencode/protocol/errors"
import { Cause, Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { requestRef } from "../location"

export const LocationHandler = HttpApiBuilder.group(Api, "server.location", (handlers) =>
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service
    const activity = yield* LocationActivity.Service
    const fileWatch = yield* FileWatch.Service
    return handlers
      .handle(
        "location.get",
        Effect.fn(function* () {
          const location = yield* Location.Service
          return new Location.Info({
            directory: location.directory,
            project: location.project,
          })
        }),
      )
      .handle(
        "location.release",
        Effect.fn(function* (ctx) {
          // Resolve through requestRef so the directory matches the one the location middleware cached services under.
          const directory = requestRef(ctx.request).directory
          const released = yield* activity.release(directory)
          // File watches outlive the location's services, so they are stopped here as well.
          yield* fileWatch.release(directory)
          return { released }
        }),
      )
      .handle("location.reload", () =>
        LocationServiceMap.reload().pipe(
          Effect.provideService(LocationServiceMap.Service, locations),
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(Cause.fromReasons<never>(cause.reasons.filter(Cause.isInterruptReason)))
              : Effect.fail(new ServiceUnavailableError({ message: Cause.pretty(cause), service: "location" })),
          ),
        ),
      )
  }),
)
