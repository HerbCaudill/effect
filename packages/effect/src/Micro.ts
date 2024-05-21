/**
 * A lightweight alternative to the `Effect` data type, with a subset of the functionality.
 *
 * @since 3.2.0
 */
import * as Context from "./Context.js"
import * as Duration from "./Duration.js"
import type { Effect } from "./Effect.js"
import * as Effectable from "./Effectable.js"
import * as Either from "./Either.js"
import { constVoid, dual, identity, type LazyArg } from "./Function.js"
import { SingleShotGen } from "./internal/singleShotGen.js"
import * as Env from "./MicroEnv.js"
import * as Option from "./Option.js"
import { type Pipeable, pipeArguments } from "./Pipeable.js"
import type { Concurrency, Covariant, NoInfer, NotFunction } from "./Types.js"
import { YieldWrap, yieldWrapGet } from "./Utils.js"

/**
 * @since 3.2.0
 */
export const TypeId: unique symbol = Symbol.for("effect/Micro")

/**
 * @since 3.2.0
 */
export type TypeId = typeof TypeId

/**
 * @since 3.2.0
 */
export const runSymbol: unique symbol = Symbol.for("effect/Micro/runSymbol")

/**
 * @since 3.2.0
 */
export type runSymbol = typeof runSymbol

/**
 * @since 3.2.0
 */
export interface Micro<out A, out E = never, out R = never> extends Effect<A, E, R> {
  readonly [TypeId]: {
    _A: Covariant<A>
    _E: Covariant<E>
    _R: Covariant<R>
  }
  readonly [runSymbol]: (env: Env.MicroEnv<any>, onResult: (result: Result<A, E>) => void) => void
  [Symbol.iterator](): MicroIterator<Micro<A, E, R>>
}

/**
 * @since 3.2.0
 */
export declare namespace Micro {
  /**
   * @since 3.2.0
   */
  export type Success<T> = T extends Micro<infer _A, infer _E, infer _R> ? _A : never
}

/**
 * @since 3.2.0
 */
export const isMicro = (u: unknown): u is Micro<any, any, any> => typeof u === "object" && u !== null && TypeId in u

/**
 * @since 3.2.0
 * @category models
 */
export interface MicroIterator<T extends Micro<any, any, any>> {
  next(...args: ReadonlyArray<any>): IteratorResult<YieldWrap<T>, Micro.Success<T>>
}

// Failures

/**
 * @since 3.2.0
 */
export const FailureTypeId = Symbol.for("effect/Micro/Failure")

/**
 * @since 3.2.0
 */
export type FailureTypeId = typeof FailureTypeId

/**
 * @since 3.2.0
 */
export type Failure<E> = Failure.Unexpected | Failure.Expected<E>

/**
 * @since 3.2.0
 */
export declare namespace Failure {
  /**
   * @since 3.2.0
   */
  export interface Proto extends Pipeable {
    readonly [FailureTypeId]: FailureTypeId
  }

  /**
   * @since 3.2.0
   */
  export interface Unexpected extends Proto {
    readonly _tag: "Unexpected"
    readonly defect: unknown
  }

  /**
   * @since 3.2.0
   */
  export interface Expected<E> extends Proto {
    readonly _tag: "Expected"
    readonly error: E
  }

  /**
   * @since 3.2.0
   */
  export interface Aborted extends Proto {
    readonly _tag: "Aborted"
  }
}

const FailureProto: Failure.Proto = {
  [FailureTypeId]: FailureTypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * @since 3.2.0
 */
export const FailureExpected = <E>(error: E): Failure<E> => {
  const self = Object.create(FailureProto)
  self._tag = "Expected"
  self.error = error
  return self
}

/**
 * @since 3.2.0
 */
export const FailureUnexpected = (defect: unknown): Failure<never> => {
  const self = Object.create(FailureProto)
  self._tag = "Unexpected"
  self.defect = defect
  return self
}

/**
 * @since 3.2.0
 */
export const FailureAborted: Failure<never> = Object.assign(Object.create(FailureProto), {
  _tag: "Aborted"
})

/**
 * @since 3.2.0
 */
export const failureSquash = <E>(self: Failure<E>): unknown => self._tag === "Expected" ? self.error : self.defect

// Result

/**
 * @since 3.2.0
 */
export type Result<A, E = never> = Either.Either<A, Failure<E>>

const ResultAborted = Either.left(FailureAborted)

// Handle

/**
 * @since 3.2.0
 */
export const HandleTypeId: unique symbol = Symbol.for("effect/Micro/Handle")

/**
 * @since 3.2.0
 */
export type HandleTypeId = typeof HandleTypeId

/**
 * @since 3.2.0
 */
export interface Handle<A, E = never> {
  readonly [HandleTypeId]: HandleTypeId
  readonly await: Micro<Result<A, E>>
  readonly join: Micro<A, E>
  readonly abort: Micro<void>
  readonly unsafeAbort: () => void
  readonly addObserver: (observer: (result: Result<A, E>) => void) => void
  readonly removeObserver: (observer: (result: Result<A, E>) => void) => void
  readonly unsafePoll: () => Result<A, E> | null
}

// Micro

const MicroProto = {
  ...Effectable.EffectPrototype,
  _op: "Micro",
  [TypeId]: {
    _A: identity,
    _E: identity,
    _R: identity
  },
  [Symbol.iterator]() {
    return new SingleShotGen(new YieldWrap(this)) as any
  }
}

const unsafeMake = <A, E, R>(
  run: (env: Env.MicroEnv<R>, onResult: (result: Result<A, E>) => void) => void
): Micro<A, E, R> => {
  const self = Object.create(MicroProto)
  self[runSymbol] = run
  return self
}

const unsafeMakeNoAbort = <A, E, R>(
  run: (env: Env.MicroEnv<R>, onResult: (result: Result<A, E>) => void) => void
): Micro<A, E, R> =>
  unsafeMake(function(env, onResult) {
    try {
      run(env, onResult)
    } catch (err) {
      onResult(Either.left(FailureUnexpected(err)))
    }
  })

/**
 * @since 3.2.0
 */
export const make = <A, E, R>(
  run: (env: Env.MicroEnv<R>, onResult: (result: Result<A, E>) => void) => void
): Micro<A, E, R> =>
  unsafeMake(function(env: Env.MicroEnv<R>, onResult: (result: Result<A, E>) => void) {
    if (env.refs[currentInterruptible.key] !== false && (env.refs[Env.currentAbortSignal.key] as AbortSignal).aborted) {
      return onResult(ResultAborted)
    }
    try {
      run(env, onResult)
    } catch (err) {
      onResult(Either.left(FailureUnexpected(err)))
    }
  })

/**
 * @since 3.2.0
 */
export const succeed = <A>(a: A): Micro<A> =>
  make(function(_env, onResult) {
    onResult(Either.right(a))
  })

/**
 * @since 3.2.0
 */
export const fail = <E>(e: E): Micro<never, E> =>
  make(function(_env, onResult) {
    onResult(Either.left(FailureExpected(e)))
  })

/**
 * @since 3.2.0
 */
export const die = (defect: unknown): Micro<never> =>
  make(function(_env, onResult) {
    onResult(Either.left(FailureUnexpected(defect)))
  })

/**
 * @since 3.2.0
 */
export const failWith = <E>(failure: Failure<E>): Micro<never, E> =>
  make(function(_env, onResult) {
    onResult(Either.left(failure))
  })

/**
 * @since 3.2.0
 */
export const sync = <A>(evaluate: LazyArg<A>): Micro<A> =>
  make(function(_env, onResult) {
    onResult(Either.right(evaluate()))
  })

/**
 * @since 3.2.0
 */
export const fromResult = <A, E>(self: Result<A, E>): Micro<A, E> =>
  make(function(_env, onResult) {
    onResult(self)
  })

/**
 * @since 3.2.0
 */
export const service = <I, S>(tag: Context.Tag<I, S>): Micro<S, never, I> =>
  make(function(env, onResult) {
    onResult(Either.right(Context.get(Env.get(env, Env.currentContext) as Context.Context<I>, tag as any) as S))
  })

/**
 * @since 3.2.0
 */
export const fromOption = <A>(option: Option.Option<A>): Micro<A, Option.None<never>> =>
  make(function(_env, onResult) {
    onResult(option._tag === "Some" ? Either.right(option.value) : Either.left(FailureExpected(Option.none())) as any)
  })

/**
 * @since 3.2.0
 */
export const fromEither = <R, L>(either: Either.Either<R, L>): Micro<R, L> =>
  make(function(_env, onResult) {
    onResult(either._tag === "Right" ? either : Either.left(FailureExpected(either.left)) as any)
  })

/**
 * @since 3.2.0
 */
export const flatten = <A, E, R, E2, R2>(self: Micro<Micro<A, E, R>, E2, R2>): Micro<A, E | E2, R | R2> =>
  make(function(env, onResult) {
    self[runSymbol](
      env,
      (result) => result._tag === "Left" ? onResult(result as any) : result.right[runSymbol](env, onResult)
    )
  })

/**
 * @since 3.2.0
 */
export const suspend = <A, E, R>(evaluate: LazyArg<Micro<A, E, R>>): Micro<A, E, R> =>
  make(function(env, onResult) {
    evaluate()[runSymbol](env, onResult)
  })

const void_: Micro<void> = succeed(void 0)
export {
  /**
   * @since 3.2.0
   */
  void_ as void
}

/**
 * @since 3.2.0
 */
export const map: {
  <A, B>(f: (a: NoInfer<A>) => B): <E, R>(self: Micro<A, E, R>) => Micro<B, E, R>
  <A, E, R, B>(self: Micro<A, E, R>, f: (a: NoInfer<A>) => B): Micro<B, E, R>
} = dual(2, <A, E, R, B>(self: Micro<A, E, R>, f: (a: A) => B): Micro<B, E, R> =>
  make(function(env, onResult) {
    self[runSymbol](env, function(result) {
      onResult(Either.map(result, f))
    })
  }))

/**
 * @since 3.2.0
 */
export const as: {
  <A, B>(value: B): <E, R>(self: Micro<A, E, R>) => Micro<B, E, R>
  <A, E, R, B>(self: Micro<A, E, R>, value: B): Micro<B, E, R>
} = dual(2, <A, E, R, B>(self: Micro<A, E, R>, value: B): Micro<B, E, R> => map(self, (_) => value))

/**
 * @since 3.2.0
 */
export const flatMap: {
  <A, B, E2, R2>(f: (a: NoInfer<A>) => Micro<B, E2, R2>): <E, R>(self: Micro<A, E, R>) => Micro<B, E, R>
  <A, E, R, B, E2, R2>(self: Micro<A, E, R>, f: (a: NoInfer<A>) => Micro<B, E2, R2>): Micro<B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(self: Micro<A, E, R>, f: (a: A) => Micro<B, E2, R2>): Micro<B, E | E2, R | R2> =>
    make(function(env, onResult) {
      self[runSymbol](env, function(result) {
        if (result._tag === "Left") {
          return onResult(result as any)
        }
        f(result.right)[runSymbol](env, onResult)
      })
    })
)

/**
 * @since 3.2.0
 */
export const andThen: {
  <A, X>(
    f: (a: NoInfer<A>) => X
  ): <E, R>(
    self: Micro<A, E, R>
  ) => [X] extends [Micro<infer A1, infer E1, infer R1>] ? Micro<A1, E | E1, R | R1>
    : Micro<X, E, R>
  <X>(
    f: NotFunction<X>
  ): <A, E, R>(
    self: Micro<A, E, R>
  ) => [X] extends [Micro<infer A1, infer E1, infer R1>] ? Micro<A1, E | E1, R | R1>
    : Micro<X, E, R>
  <A, E, R, X>(
    self: Micro<A, E, R>,
    f: (a: NoInfer<A>) => X
  ): [X] extends [Micro<infer A1, infer E1, infer R1>] ? Micro<A1, E | E1, R | R1>
    : Micro<X, E, R>
  <A, E, R, X>(
    self: Micro<A, E, R>,
    f: NotFunction<X>
  ): [X] extends [Micro<infer A1, infer E1, infer R1>] ? Micro<A1, E | E1, R | R1>
    : Micro<X, E, R>
} = dual(
  2,
  <A, E, R, B, E2, R2>(self: Micro<A, E, R>, f: any): Micro<B, E | E2, R | R2> =>
    make(function(env, onResult) {
      self[runSymbol](env, function(result) {
        if (result._tag === "Left") {
          return onResult(result as any)
        }
        const value = isMicro(f) ? f : typeof f === "function" ? f(result.right) : f
        if (isMicro(value)) {
          value[runSymbol](env, onResult)
        } else {
          onResult(Either.right(value))
        }
      })
    })
)

/**
 * @since 3.2.0
 */
export const tap: {
  <A, X>(
    f: (a: NoInfer<A>) => X
  ): <E, R>(
    self: Micro<A, E, R>
  ) => [X] extends [Micro<infer _A1, infer E1, infer R1>] ? Micro<A, E | E1, R | R1>
    : Micro<A, E, R>
  <X>(
    f: NotFunction<X>
  ): <A, E, R>(
    self: Micro<A, E, R>
  ) => [X] extends [Micro<infer _A1, infer E1, infer R1>] ? Micro<A, E | E1, R | R1>
    : Micro<A, E, R>
  <A, E, R, X>(
    self: Micro<A, E, R>,
    f: (a: NoInfer<A>) => X
  ): [X] extends [Micro<infer _A1, infer E1, infer R1>] ? Micro<A, E | E1, R | R1>
    : Micro<A, E, R>
  <A, E, R, X>(
    self: Micro<A, E, R>,
    f: NotFunction<X>
  ): [X] extends [Micro<infer _A1, infer E1, infer R1>] ? Micro<A, E | E1, R | R1>
    : Micro<A, E, R>
} = dual(
  2,
  <A, E, R, B, E2, R2>(self: Micro<A, E, R>, f: (a: A) => Micro<B, E2, R2>): Micro<A, E | E2, R | R2> =>
    make(function(env, onResult) {
      self[runSymbol](env, function(selfResult) {
        if (selfResult._tag === "Left") {
          return onResult(selfResult as any)
        }
        const value = isMicro(f) ? f : typeof f === "function" ? f(selfResult.right) : f
        if (isMicro(value)) {
          value[runSymbol](env, function(tapResult) {
            if (tapResult._tag === "Left") {
              return onResult(tapResult)
            }
            onResult(selfResult)
          })
        } else {
          onResult(selfResult)
        }
      })
    })
)

/**
 * @since 3.2.0
 */
export const asVoid = <A, E, R>(self: Micro<A, E, R>): Micro<void, E, R> => map(self, (_) => undefined)

/**
 * @since 3.2.0
 */
export const zipRight: {
  <A, B, E2, R2>(that: Micro<B, E2, R2>): <E, R>(self: Micro<A, E, R>) => Micro<B, E, R>
  <A, E, R, B, E2, R2>(self: Micro<A, E, R>, that: Micro<B, E2, R2>): Micro<B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(self: Micro<A, E, R>, that: Micro<B, E2, R2>): Micro<B, E | E2, R | R2> =>
    make(function(env, onResult) {
      self[runSymbol](env, function(result) {
        if (result._tag === "Left") {
          return onResult(result as any)
        }
        that[runSymbol](env, onResult)
      })
    })
)

/**
 * @since 3.2.0
 */
export const async = <A, E = never, R = never>(
  register: (resume: (effect: Micro<A, E, R>) => void, signal: AbortSignal) => void | Micro<void, never, R>
): Micro<A, E, R> =>
  flatten(
    make(function(env, onResult) {
      let resumed = false
      let onAbort: LazyArg<void> | undefined = undefined
      const signal = Env.get(env, Env.currentAbortSignal)
      function resume(effect: Micro<A, E, R>) {
        if (resumed) {
          return
        }
        resumed = true
        if (onAbort !== undefined) {
          signal.removeEventListener("abort", onAbort)
        }
        onResult(Either.right(effect))
      }
      const cleanup = register(resume, signal)
      if (cleanup) {
        onAbort = function() {
          resume(uninterruptible(zipRight(cleanup, failWith(FailureAborted))))
        }
        signal.addEventListener("abort", onAbort)
      }
    })
  )

/**
 * @since 3.2.0
 */
export const never: Micro<never> = async<never>(function() {
  const interval = setInterval(constVoid, 2147483646)
  return sync(() => clearInterval(interval))
})

/**
 * @since 3.2.0
 */
export const sleep = (duration: Duration.DurationInput): Micro<void> => {
  const millis = Duration.toMillis(duration)
  return async(function(resume) {
    const timeout = setTimeout(function() {
      resume(void_)
    }, millis)
    return sync(() => clearTimeout(timeout))
  })
}

/**
 * @since 3.2.0
 */
export const delay: {
  (duration: Duration.DurationInput): <A, E, R>(self: Micro<A, E, R>) => Micro<A, E, R>
  <A, E, R>(self: Micro<A, E, R>, duration: Duration.DurationInput): Micro<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Micro<A, E, R>, duration: Duration.DurationInput): Micro<A, E, R> => zipRight(sleep(duration), self)
)

/**
 * @since 3.2.0
 */
export const asResult = <A, E, R>(self: Micro<A, E, R>): Micro<Result<A, E>, never, R> =>
  make(function(env, onResult) {
    self[runSymbol](env, function(result) {
      onResult(Either.right(result))
    })
  })

/**
 * @since 3.2.0
 */
export const onResult: {
  <A, E, XE, XR>(
    f: (result: Result<A, E>) => Micro<void, XE, XR>
  ): <R>(self: Micro<A, E, R>) => Micro<A, E | XE, R | XR>
  <A, E, R, XE, XR>(self: Micro<A, E, R>, f: (result: Result<A, E>) => Micro<void, XE, XR>): Micro<A, E | XE, R | XR>
} = dual(
  2,
  <A, E, R, XE, XR>(self: Micro<A, E, R>, f: (result: Result<A, E>) => Micro<void, XE, XR>): Micro<A, E | XE, R | XR> =>
    uninterruptibleMask((restore) =>
      flatMap(asResult(restore(self)), (result) => zipRight(f(result), fromResult(result)))
    )
)

/**
 * @since 3.2.0
 */
export const acquireUseRelease = <Resource, E, R, A, E2, R2, R3>(
  acquire: Micro<Resource, E, R>,
  use: (a: Resource) => Micro<A, E2, R2>,
  release: (a: Resource, result: Result<A, E2>) => Micro<void, never, R3>
): Micro<A, E | E2, R | R2 | R3> =>
  uninterruptibleMask((restore) =>
    flatMap(
      acquire,
      (a) =>
        flatMap(
          asResult(restore(use(a))),
          (result) => zipRight(release(a, result), fromResult(result))
        )
    )
  )

/**
 * @since 3.2.0
 */
export const envGet = <A>(fiberRef: Env.MicroEnvRef<A>): Micro<A> =>
  make((env, onResult) => onResult(Either.right(Env.get(env, fiberRef))))

/**
 * @since 3.2.0
 */
export const locally: {
  <A>(fiberRef: Env.MicroEnvRef<A>, value: A): <XA, E, R>(self: Micro<XA, E, R>) => Micro<XA, E, R>
  <XA, E, R, A>(self: Micro<XA, E, R>, fiberRef: Env.MicroEnvRef<A>, value: A): Micro<XA, E, R>
} = dual(
  3,
  <XA, E, R, A>(self: Micro<XA, E, R>, fiberRef: Env.MicroEnvRef<A>, value: A): Micro<XA, E, R> =>
    make((env, onResult) => self[runSymbol](Env.set(env, fiberRef, value), onResult))
)

/**
 * @since 3.2.0
 */
export const context = <R>(): Micro<Context.Context<R>> => envGet(Env.currentContext) as any

/**
 * @since 3.2.0
 */
export const uninterruptible = <A, E, R>(self: Micro<A, E, R>): Micro<A, E, R> =>
  unsafeMakeNoAbort(function(env, onResult) {
    const nextEnv = Env.mutate(env, function(env) {
      env[currentInterruptible.key] = false
      env[Env.currentAbortSignal.key] = new AbortController().signal
      return env
    })
    self[runSymbol](nextEnv, onResult)
  })

/**
 * @since 3.2.0
 */
export const uninterruptibleMask = <A, E, R>(
  f: (restore: <A, E, R>(effect: Micro<A, E, R>) => Micro<A, E, R>) => Micro<A, E, R>
): Micro<A, E, R> =>
  unsafeMakeNoAbort((env, onResult) => {
    const isInterruptible = Env.get(env, currentInterruptible)
    const effect = isInterruptible ? f(interruptible) : f(identity)
    const nextEnv = isInterruptible ?
      Env.mutate(env, function(env) {
        env[currentInterruptible.key] = false
        env[Env.currentAbortSignal.key] = new AbortController().signal
        return env
      }) :
      env
    effect[runSymbol](nextEnv, onResult)
  })

/**
 * @since 3.2.0
 */
export const interruptible = <A, E, R>(self: Micro<A, E, R>): Micro<A, E, R> =>
  make((env, onResult) => {
    const isInterruptible = Env.get(env, currentInterruptible)
    let newEnv = env
    if (!isInterruptible) {
      const controller = Env.get(env, Env.currentAbortController)
      newEnv = Env.mutate(env, function(env) {
        env[currentInterruptible.key] = true
        env[Env.currentAbortSignal.key] = controller.signal
        return env
      })
    }
    self[runSymbol](newEnv, onResult)
  })

/**
 * @since 3.2.0
 */
export const provideContext: {
  <XR>(context: Context.Context<XR>): <A, E, R>(self: Micro<A, E, R>) => Micro<A, E, Exclude<R, XR>>
  <A, E, R, XR>(self: Micro<A, E, R>, context: Context.Context<XR>): Micro<A, E, Exclude<R, XR>>
} = dual(
  2,
  <A, E, R, XR>(self: Micro<A, E, R>, provided: Context.Context<XR>): Micro<A, E, Exclude<R, XR>> =>
    make(function(env, onResult) {
      const context = Env.get(env, Env.currentContext)
      const nextEnv = Env.set(env, Env.currentContext, Context.merge(context, provided))
      self[runSymbol](nextEnv, onResult)
    })
)

/**
 * @since 3.2.0
 */
export const provideService: {
  <I, S>(tag: Context.Tag<I, S>, service: S): <A, E, R>(self: Micro<A, E, R>) => Micro<A, E, Exclude<R, I>>
  <A, E, R, I, S>(self: Micro<A, E, R>, tag: Context.Tag<I, S>, service: S): Micro<A, E, Exclude<R, I>>
} = dual(
  3,
  <A, E, R, I, S>(self: Micro<A, E, R>, tag: Context.Tag<I, S>, service: S): Micro<A, E, Exclude<R, I>> =>
    make(function(env, onResult) {
      const context = Env.get(env, Env.currentContext)
      const nextEnv = Env.set(env, Env.currentContext, Context.add(context, tag, service))
      self[runSymbol](nextEnv, onResult)
    })
)

/**
 * @since 3.2.0
 */
export const provideServiceEffect: {
  <I, S, E2, R2>(
    tag: Context.Tag<I, S>,
    acquire: Micro<S, E2, R2>
  ): <A, E, R>(self: Micro<A, E, R>) => Micro<A, E | E2, Exclude<R, I> | R2>
  <A, E, R, I, S, E2, R2>(
    self: Micro<A, E, R>,
    tag: Context.Tag<I, S>,
    acquire: Micro<S, E2, R2>
  ): Micro<A, E | E2, Exclude<R, I> | R2>
} = dual(
  3,
  <A, E, R, I, S, E2, R2>(
    self: Micro<A, E, R>,
    tag: Context.Tag<I, S>,
    acquire: Micro<S, E2, R2>
  ): Micro<A, E | E2, Exclude<R, I> | R2> => flatMap(acquire, (service) => provideService(self, tag, service))
)

export const gen = <Eff extends YieldWrap<Micro<any, any, any>>, AEff>(
  f: () => Generator<Eff, AEff, never>
): Micro<
  AEff,
  [Eff] extends [never] ? never : [Eff] extends [YieldWrap<Micro<infer _A, infer E, infer _R>>] ? E : never,
  [Eff] extends [never] ? never : [Eff] extends [YieldWrap<Micro<infer _A, infer _E, infer R>>] ? R : never
> =>
  make(function(env, onResult) {
    const iterator = f() as Iterator<YieldWrap<Micro<any, any, any>>, AEff, any>
    let running = false
    let value: any = undefined
    function run() {
      running = true
      try {
        let shouldContinue = true
        while (shouldContinue) {
          const result = iterator.next(value)
          if (result.done) {
            return onResult(Either.right(result.value))
          }
          shouldContinue = false
          yieldWrapGet(result.value)[runSymbol](env, function(result) {
            if (result._tag === "Left") {
              onResult(result)
            } else {
              shouldContinue = true
              value = result.right
              if (!running) run()
            }
          })
        }
      } catch (err) {
        onResult(Either.left(FailureUnexpected(err)))
      }
      running = false
    }
    run()
  })

// ========================================================================
// Collecting
// ========================================================================

/**
 * @since 3.2.0
 */
export const forEach: {
  <A, B, E, R>(iterable: Iterable<A>, f: (a: NoInfer<A>) => Micro<B, E, R>, options?: {
    readonly concurrency?: Concurrency | undefined
    readonly discard?: false | undefined
  }): Micro<Array<B>, E, R>
  <A, B, E, R>(iterable: Iterable<A>, f: (a: NoInfer<A>) => Micro<B, E, R>, options: {
    readonly concurrency?: Concurrency | undefined
    readonly discard: true
  }): Micro<void, E, R>
} = <
  A,
  B,
  E,
  R
>(iterable: Iterable<A>, f: (a: NoInfer<A>) => Micro<B, E, R>, options?: {
  readonly concurrency?: Concurrency | undefined
  readonly discard?: boolean | undefined
}): Micro<any, E, R> =>
  make(function(env, onResult) {
    const concurrency = options?.concurrency === "inherit"
      ? Env.get(env, Env.currentConcurrency)
      : options?.concurrency ?? 1
    if (concurrency === "unbounded" || concurrency > 1) {
      forEachConcurrent(iterable, f, {
        discard: options?.discard,
        concurrency
      })[runSymbol](
        env,
        onResult
      )
    } else {
      forEachSequential(iterable, f, options)[runSymbol](env, onResult)
    }
  })

const forEachSequential = <
  A,
  B,
  E,
  R
>(iterable: Iterable<A>, f: (a: NoInfer<A>) => Micro<B, E, R>, options?: {
  readonly discard?: boolean | undefined
}): Micro<any, E, R> =>
  make(function(env, onResult) {
    const items = Array.from(iterable)
    const length = items.length
    const out: Array<B> | undefined = options?.discard ? undefined : new Array(length)
    let index = 0
    let running = false
    function tick(): void {
      running = true
      while (index < length) {
        let complete = false
        const current = index++
        try {
          f(items[current])[runSymbol](env, function(result) {
            complete = true
            if (result._tag === "Left") {
              index = length
              onResult(result)
            } else if (out !== undefined) {
              out[current] = result.right
            }
            if (current === length - 1) {
              onResult(Either.right(out))
            } else if (!running) {
              tick()
            }
          })
        } catch (err) {
          onResult(Either.left(FailureUnexpected(err)))
          break
        }
        if (!complete) {
          break
        }
      }
      running = false
    }
    tick()
  })

const forEachConcurrent = <
  A,
  B,
  E,
  R
>(iterable: Iterable<A>, f: (a: NoInfer<A>) => Micro<B, E, R>, options: {
  readonly concurrency: number | "unbounded"
  readonly discard?: boolean | undefined
}): Micro<any, E, R> =>
  unsafeMake(function(env, onResult) {
    // abort
    const controller = new AbortController()
    const parentSignal = Env.get(env, Env.currentAbortSignal)
    function onAbort() {
      length = index
      controller.abort()
      parentSignal.removeEventListener("abort", onAbort)
    }
    parentSignal.addEventListener("abort", onAbort)
    const envWithSignal = Env.set(env, Env.currentAbortSignal, controller.signal)

    // iterate
    const concurrency = options.concurrency === "unbounded" ? Infinity : options.concurrency
    let failure: Result<any, any> | undefined = undefined
    const items = Array.from(iterable)
    let length = items.length
    const out: Array<B> | undefined = options?.discard ? undefined : new Array(length)
    let index = 0
    let inProgress = 0
    let doneCount = 0
    let pumping = false
    function pump() {
      pumping = true
      while (inProgress < concurrency && index < length) {
        const currentIndex = index
        const item = items[currentIndex]
        index++
        inProgress++
        try {
          f(item)[runSymbol](envWithSignal, function(result) {
            doneCount++
            inProgress--
            if (result._tag === "Left") {
              if (failure === undefined) {
                failure = result
                onAbort()
              }
            } else if (out !== undefined) {
              out[currentIndex] = result.right
            }
            if (doneCount === length) {
              parentSignal.removeEventListener("abort", onAbort)
              onResult(failure ?? Either.right(out))
            } else if (!pumping && inProgress < concurrency) {
              pump()
            }
          })
        } catch (err) {
          failure = Either.left(FailureUnexpected(err))
          onAbort()
        }
      }
      pumping = false
    }
    pump()
  })

class HandleImpl<A, E> implements Handle<A, E> {
  readonly [HandleTypeId]: HandleTypeId

  readonly observers: Set<(result: Result<A, E>) => void> = new Set()
  private _result: Result<A, E> | undefined = undefined
  _controller: AbortController
  readonly isRoot: boolean

  constructor(readonly parentSignal: AbortSignal, controller?: AbortController) {
    this[HandleTypeId] = HandleTypeId
    this.isRoot = controller !== undefined
    this._controller = controller ?? new AbortController()
    if (!this.isRoot) {
      parentSignal.addEventListener("abort", this.unsafeAbort)
    }
  }

  unsafePoll(): Result<A, E> | null {
    return this._result ?? null
  }

  unsafeAbort = () => {
    this._controller.abort()
  }

  emit(result: Result<A, E>): void {
    if (this._result) {
      return
    }
    this._result = result
    if (!this.isRoot) {
      this.parentSignal.removeEventListener("abort", this.unsafeAbort)
    }
    this._controller.abort()
    this.observers.forEach((observer) => observer(result))
    this.observers.clear()
  }

  addObserver(observer: (result: Result<A, E>) => void): void {
    if (this._result) {
      return observer(this._result)
    }
    this.observers.add(observer)
  }

  removeObserver(observer: (result: Result<A, E>) => void): void {
    this.observers.delete(observer)
  }

  get await(): Micro<Result<A, E>> {
    return suspend(() => {
      if (this._result) {
        return succeed(this._result)
      }
      return async((resume) => {
        function observer(result: Result<A, E>) {
          resume(succeed(result))
        }
        this.addObserver(observer)
        return sync(() => {
          this.removeObserver(observer)
        })
      })
    })
  }

  get join(): Micro<A, E> {
    return suspend(() => {
      if (this._result) {
        return fromResult(this._result)
      }
      return async((resume) => {
        function observer(result: Result<A, E>) {
          resume(fromResult(result))
        }
        this.addObserver(observer)
        return sync(() => {
          this.removeObserver(observer)
        })
      })
    })
  }

  get abort(): Micro<void> {
    return suspend(() => {
      this.unsafeAbort()
      return asVoid(this.await)
    })
  }
}

/**
 * @since 3.2.0
 */
export const fork = <A, E, R>(self: Micro<A, E, R>): Micro<Handle<A, E>, never, R> =>
  make(function(env, onResult) {
    const signal = Env.get(env, Env.currentAbortSignal)
    const handle = new HandleImpl<A, E>(signal)
    const nextEnv = Env.mutate(env, (map) => {
      map[Env.currentAbortController.key] = handle._controller
      map[Env.currentAbortSignal.key] = handle._controller.signal
      return map
    })
    Promise.resolve().then(() => {
      self[runSymbol](nextEnv, (result) => {
        handle.emit(result)
      })
      onResult(Either.right(handle))
    })
  })

/**
 * @since 3.2.0
 */
export const forkDaemon = <A, E, R>(self: Micro<A, E, R>): Micro<Handle<A, E>, never, R> =>
  make(function(env, onResult) {
    const controller = new AbortController()
    const handle = new HandleImpl<A, E>(controller.signal, controller)
    const nextEnv = Env.mutate(env, (map) => {
      map[Env.currentAbortController.key] = controller
      map[Env.currentAbortSignal.key] = controller.signal
      return map
    })
    Promise.resolve().then(() => {
      self[runSymbol](nextEnv, (result) => {
        handle.emit(result)
      })
      onResult(Either.right(handle))
    })
  })

/**
 * @since 3.2.0
 */
export const runFork = <A, E>(effect: Micro<A, E>): Handle<A, E> => {
  const controller = new AbortController()
  const refs = Object.create(null)
  refs[Env.currentAbortController.key] = controller
  refs[Env.currentAbortSignal.key] = controller.signal
  const env = Env.make(refs)
  const handle = new HandleImpl<A, E>(controller.signal, controller)
  effect[runSymbol](Env.set(env, Env.currentAbortSignal, handle._controller.signal), (result) => {
    handle.emit(result)
  })
  return handle
}

/**
 * @since 3.2.0
 */
export const runPromise = <A, E>(effect: Micro<A, E>): Promise<A> =>
  new Promise((resolve, reject) => {
    const handle = runFork(effect)
    handle.addObserver((result) => {
      if (result._tag === "Left") {
        reject(failureSquash(result.left))
      } else {
        resolve(result.right)
      }
    })
  })

/**
 * @since 3.2.0
 */
export const runSyncResult = <A, E>(effect: Micro<A, E>): Result<A, E> => {
  const handle = runFork(effect)
  const result = handle.unsafePoll()
  if (result) {
    return result
  }
  throw handle
}

/**
 * @since 3.2.0
 */
export const runSync = <A, E>(effect: Micro<A, E>): A => {
  const handle = runFork(effect)
  const result = handle.unsafePoll()
  if (result === null) {
    throw handle
  } else if (result._tag === "Left") {
    throw result.left
  }
  return result.right
}

// ========================================================================
// Scope
// ========================================================================

/**
 * @since 3.2.0
 */
export const MicroScopeTypeId: unique symbol = Symbol.for("effect/Micro/MicroScope")

/**
 * @since 3.2.0
 */
export type MicroScopeTypeId = typeof MicroScopeTypeId

/**
 * @since 3.2.0
 */
export interface MicroScope {
  readonly [MicroScopeTypeId]: MicroScopeTypeId
  readonly addFinalizer: (finalizer: (result: Result<any, any>) => Micro<void>) => Micro<void>
  readonly fork: Micro<MicroScope.Closeable>
}

/**
 * @since 3.2.0
 */
export declare namespace MicroScope {
  /**
   * @since 3.2.0
   */
  export interface Closeable extends MicroScope {
    readonly close: (result: Result<any, any>) => Micro<void>
  }
}

/**
 * @since 3.2.0
 */
export const MicroScope: Context.Tag<MicroScope, MicroScope> = Context.GenericTag<MicroScope>("effect/Micro/MicroScope")

class ScopeImpl implements MicroScope.Closeable {
  readonly [MicroScopeTypeId]: MicroScopeTypeId
  state: {
    readonly _tag: "Open"
    readonly finalizers: Set<(result: Result<any, any>) => Micro<void>>
  } | {
    readonly _tag: "Closed"
    readonly result: Result<any, any>
  } = { _tag: "Open", finalizers: new Set() }

  constructor() {
    this[MicroScopeTypeId] = MicroScopeTypeId
  }

  unsafeAddFinalizer(finalizer: (result: Result<any, any>) => Micro<void>): void {
    if (this.state._tag === "Open") {
      this.state.finalizers.add(finalizer)
    }
  }
  addFinalizer(finalizer: (result: Result<any, any>) => Micro<void>): Micro<void> {
    return suspend(() => {
      if (this.state._tag === "Open") {
        this.state.finalizers.add(finalizer)
        return void_
      }
      return finalizer(this.state.result)
    })
  }
  unsafeRemoveFinalizer(finalizer: (result: Result<any, any>) => Micro<void>): void {
    if (this.state._tag === "Open") {
      this.state.finalizers.delete(finalizer)
    }
  }
  close(result: Result<any, any>): Micro<void> {
    return suspend(() => {
      if (this.state._tag === "Open") {
        const finalizers = Array.from(this.state.finalizers).reverse()
        this.state = { _tag: "Closed", result }
        return flatMap(
          forEach(finalizers, (finalizer) => asResult(finalizer(result))),
          (results) => asVoid(fromResult(Either.all(results)))
        )
      }
      return void_
    })
  }
  get fork() {
    return sync(() => {
      const newScope = new ScopeImpl()
      if (this.state._tag === "Closed") {
        newScope.state = this.state
        return newScope
      }
      function fin(result: Result<any, any>) {
        return newScope.close(result)
      }
      this.state.finalizers.add(fin)
      newScope.unsafeAddFinalizer((_) => sync(() => this.unsafeRemoveFinalizer(fin)))
      return newScope
    })
  }
}

/**
 * @since 3.2.0
 */
export const makeScope = (): Micro<MicroScope.Closeable> => sync(() => new ScopeImpl())

/**
 * @since 3.2.0
 */
export const scope: Micro<MicroScope, never, MicroScope> = service(MicroScope)

/**
 * @since 3.2.0
 */
export const scoped = <A, E, R>(self: Micro<A, E, R>): Micro<A, E, Exclude<R, MicroScope>> =>
  suspend(function() {
    const scope = new ScopeImpl()
    return onResult(provideService(self, MicroScope, scope), (result) => scope.close(result))
  })

/**
 * @since 3.2.0
 */
export const acquireRelease = <A, E, R>(
  acquire: Micro<A, E, R>,
  release: (a: A, result: Result<any, any>) => Micro<void>
): Micro<A, E, R | MicroScope> =>
  uninterruptible(flatMap(
    scope,
    (scope) =>
      tap(
        acquire,
        (a) => scope.addFinalizer((result) => release(a, result))
      )
  ))

const currentInterruptible: Env.MicroEnvRef<boolean> = Env.makeRef(
  "effect/Micro/currentInterruptible",
  true
)

/**
 * @since 3.2.0
 */
export const withConcurrency: {
  (concurrency: "unbounded" | number): <A, E, R>(self: Micro<A, E, R>) => Micro<A, E, R>
  <A, E, R>(self: Micro<A, E, R>, concurrency: "unbounded" | number): Micro<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Micro<A, E, R>, concurrency: "unbounded" | number): Micro<A, E, R> =>
    locally(self, Env.currentConcurrency, concurrency)
)
