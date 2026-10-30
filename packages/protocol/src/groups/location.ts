import { Location } from "@opencode/schema/location"
import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, OpenApi } from "effect/http-api"
import { ServiceUnavailableError } from "../errors.js"

export const LocationQuery = Schema.Struct({
  location: Schema.optional(
    Schema.Struct({
      directory: Schema.optional(Schema.String),
    }),
  ),
}).annotate({ identifier: "LocationQuery" })

export const locationQueryOpenApi = OpenApi.annotations({
  transform: (operation) => {
    const parameters = operation.parameters
    if (!Array.isArray(parameters)) return operation
    return {
      ...operation,
      parameters: parameters.map((parameter) =>
        parameter?.name === "location" && parameter?.in === "query"
          ? { ...parameter, style: "deepObject", explode: true }
          : parameter,
      ),
    }
  },
})

// Middleware is applied per endpoint: reload acts on every loaded location and
// must not boot the caller's location first.
export const makeLocationGroup = <LocationId extends HttpApiMiddleware.AnyId, LocationService>(
  locationMiddleware: Context.Key<LocationId, LocationService>,
) =>
  HttpApiGroup.make("server.location")
    .add(
      HttpApiEndpoint.get("location.get", "/api/location", {
        query: LocationQuery,
        success: Location.PublicInfo,
      })
        .middleware(locationMiddleware)
        .annotateMerge(locationQueryOpenApi)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "location.get",
            summary: "Get location",
            description: "Resolve the requested location or the server default location.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.post("location.reload", "/api/location/reload", {
        success: HttpApiSchema.NoContent,
        error: ServiceUnavailableError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "location.reload",
          summary: "Reload configuration",
          description:
            "Shut down and rebuild every loaded location. Pending permissions and forms are cancelled; running sessions continue with fresh services at the next step boundary. Emits location.shutdown for client recovery and responds once all replacement builds settle.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("location.release", "/api/location/release", {
        query: LocationQuery,
        success: Schema.Struct({
          released: Schema.Boolean.annotate({
            description:
              "False when a location of the directory was kept because one of its sessions is executing or has a running background job.",
          }),
        }),
      })
        .annotateMerge(locationQueryOpenApi)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "location.release",
            summary: "Release a directory",
            description:
              "Shut down the services loaded for the requested directory, and stop the file watches inside it, so the server stops holding files and processes there. Sessions that are executing or have a running background job keep their location. Never loads the directory; its next use boots it again.",
          }),
        ),
    )
    .annotateMerge(OpenApi.annotations({ title: "location" }))
