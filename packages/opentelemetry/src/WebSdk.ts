/**
 * @since 1.0.0
 */
import type { TracerProvider } from "@opentelemetry/api"
import type * as Resources from "@opentelemetry/resources"
import type { MetricReader } from "@opentelemetry/sdk-metrics"
import type { SpanProcessor, TracerConfig } from "@opentelemetry/sdk-trace-base"
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web"
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import type { LazyArg } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Metrics from "./Metrics.js"
import * as Resource from "./Resource.js"
import * as Tracer from "./Tracer.js"

/**
 * @since 1.0.0
 * @category model
 */
export interface Configuration {
  readonly spanProcessors?: ReadonlyArray<SpanProcessor>
  readonly tracerConfig?: Omit<TracerConfig, "resource">
  readonly metricReaders?: ReadonlyArray<MetricReader>
  readonly resource: {
    readonly serviceName: string
    readonly serviceVersion?: string
    readonly attributes?: Resources.ResourceAttributes
  }
}

/**
 * @since 1.0.0
 * @category layers
 */
export const layerTracerProvider = (
  processors: NonEmptyReadonlyArray<SpanProcessor>,
  config?: Omit<TracerConfig, "resource">
): Layer.Layer<TracerProvider, never, Resource.Resource> =>
  Layer.scoped(
    Tracer.TracerProvider,
    Effect.flatMap(
      Resource.Resource,
      (resource) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const provider = new WebTracerProvider({
              ...(config ?? undefined),
              resource
            })
            processors.forEach((p) => provider.addSpanProcessor(p))
            return provider
          }),
          (provider) => Effect.ignoreLogged(Effect.promise(() => provider.shutdown()))
        )
    )
  )

/**
 * @since 1.0.0
 * @category layer
 */
export const layer: {
  (evaluate: LazyArg<Configuration>): Layer.Layer<Resource.Resource>
  <R, E>(evaluate: Effect.Effect<R, E, Configuration>): Layer.Layer<Resource.Resource, E, R>
} = (
  evaluate: LazyArg<Configuration> | Effect.Effect<any, any, Configuration>
): Layer.Layer<Resource.Resource> =>
  Layer.unwrapEffect(
    Effect.map(
      Effect.isEffect(evaluate)
        ? evaluate as Effect.Effect<Configuration>
        : Effect.sync(evaluate),
      (config) => {
        const ResourceLive = Resource.layer(config.resource)
        const spanProcessors = config.spanProcessors && Arr.isNonEmptyReadonlyArray(config.spanProcessors)
          ? config.spanProcessors
          : undefined
        const TracerLive = spanProcessors ?
          Tracer.layer.pipe(
            Layer.provide(layerTracerProvider(spanProcessors, config.tracerConfig))
          )
          : Layer.empty
        const metricReaders = config.metricReaders && Arr.isNonEmptyReadonlyArray(config.metricReaders)
          ? config.metricReaders
          : undefined
        const MetricsLive = metricReaders
          ? Metrics.layer(() => metricReaders)
          : Layer.empty
        return Layer.merge(TracerLive, MetricsLive).pipe(
          Layer.provideMerge(ResourceLive)
        )
      }
    )
  )
