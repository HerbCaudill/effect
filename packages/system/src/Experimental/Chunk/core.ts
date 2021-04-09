import { identity } from "../../Function"
import * as O from "../../Option"
import type { Chunk } from "./definition"
import {
  _Empty,
  ChunkTypeId,
  concrete,
  EmptyTypeId,
  Singleton,
  SingletonTypeId,
  Slice,
  SliceTypeId
} from "./definition"

export { Chunk, from } from "./definition"

/**
 * Builds a chunk of a single value
 */
export function single<A>(a: A): Chunk<A> {
  return new Singleton(a)
}

/**
 * Builds an empty chunk
 */
export function empty<A>(): Chunk<A> {
  return _Empty
}

/**
 * Appends a value to a chunk
 *
 * @dataFirst append_
 */
export function append<A1>(a: A1) {
  return <A>(self: Chunk<A>): Chunk<A | A1> => self.append(a)
}

/**
 * Appends a value to a chunk
 */
export function append_<A, A1>(self: Chunk<A>, a: A1): Chunk<A | A1> {
  return self.append(a)
}

/**
 * Prepends a value to a chunk
 *
 * @dataFirst prepend_
 */
export function prepend<A1>(a: A1) {
  return <A>(self: Chunk<A>): Chunk<A | A1> => self.prepend(a)
}

/**
 * Prepends a value to a chunk
 */
export function prepend_<A, A1>(self: Chunk<A>, a: A1): Chunk<A | A1> {
  return self.prepend(a)
}

/**
 * Concats chunks
 *
 * @dataFirst concat_
 */
export function concat<A1>(that: Chunk<A1>) {
  return <A>(self: Chunk<A>): Chunk<A | A1> => self.concat(that)
}

/**
 * Concats chunks
 */
export function concat_<A, A1>(self: Chunk<A>, that: Chunk<A1>): Chunk<A | A1> {
  return self.concat(that)
}

/**
 * Converts a chunk to an ArrayLike (either Array or Buffer)
 */
export function toArrayLike<A>(self: Chunk<A>): ArrayLike<A> {
  return self.toArrayLike()
}

/**
 * Converts a chunk to an Array
 */
export function toArray<A>(self: Chunk<A>): readonly A[] {
  return self.toArray()
}

/**
 * Safely get a value
 */
export function get_<A>(self: Chunk<A>, n: number): O.Option<A> {
  return !Number.isInteger(n) || n < 0 || n >= self.length
    ? O.none
    : O.some(self.get(n))
}

/**
 * Safely get a value
 *
 * @dataFirst get_
 */
export function get(n: number) {
  return <A>(self: Chunk<A>): O.Option<A> => get_(self, n)
}

/**
 * Unsafely get a value
 */
export function unsafeGet_<A>(self: Chunk<A>, n: number): A {
  return self.get(n)
}

/**
 * Safely get a value
 *
 * @dataFirst unsafeGet_
 */
export function unsafeGet(n: number) {
  return <A>(self: Chunk<A>): A => unsafeGet_(self, n)
}

/**
 * Type guard
 */
export function isChunk<A>(u: Iterable<A>): u is Chunk<A>
export function isChunk(u: unknown): u is Chunk<unknown>
export function isChunk(u: unknown): u is Chunk<unknown> {
  return typeof u === "object" && u != null && ChunkTypeId in u
}

const refEq = (x: unknown, y: unknown) => x === y

/**
 * Referential equality check
 */
export function equals_<A, B>(self: Chunk<A>, that: Chunk<B>): boolean {
  return corresponds_(self, that, refEq)
}

/**
 * Referential equality check
 *
 * @dataFirst equals_
 */
export function equals<B>(that: Chunk<B>): <A>(self: Chunk<A>) => boolean {
  return (self) => equals_(self, that)
}

/**
 * Takes the first n elements
 */
export function take_<A>(self: Chunk<A>, n: number): Chunk<A> {
  return self.take(n)
}

/**
 * Takes the first n elements
 *
 * @dataFirst take_
 */
export function take(n: number): <A>(self: Chunk<A>) => Chunk<A> {
  return (self) => self.take(n)
}

/**
 * Drops the first n elements
 */
export function drop_<A>(self: Chunk<A>, n: number): Chunk<A> {
  concrete(self)
  if (n <= 0) {
    return self
  } else if (n >= self.length) {
    return _Empty
  } else {
    const len = self.length
    switch (self._typeId) {
      case EmptyTypeId: {
        return _Empty
      }
      case SliceTypeId: {
        return new Slice(self.chunk, self.offset + n, self.length - n)
      }
      case SingletonTypeId: {
        if (n > 0) {
          return _Empty
        }
        return self
      }
      default: {
        return new Slice(self, n, len - n)
      }
    }
  }
}

/**
 * Drops the first n elements
 *
 * @dataFirst drop_
 */
export function drop(n: number): <A>(self: Chunk<A>) => Chunk<A> {
  return (self) => self.take(n)
}

/**
 * Returns the number of elements in the chunk
 */
export function size<A>(self: Chunk<A>) {
  return self.length
}

/**
 * Returns a chunk with the elements mapped by the specified function.
 */
export function map_<A, B>(self: Chunk<A>, f: (a: A) => B): Chunk<B> {
  let r = empty<B>()
  for (const k of self) {
    r = append_(r, f(k))
  }
  return r
}

/**
 * Returns a chunk with the elements mapped by the specified function.
 *
 * @dataFirst map_
 */
export function map<A, B>(f: (a: A) => B): (self: Chunk<A>) => Chunk<B> {
  return (self) => map_(self, f)
}

/**
 * Returns a chunk with the elements mapped by the specified function.
 */
export function chain_<A, B>(self: Chunk<A>, f: (a: A) => Chunk<B>): Chunk<B> {
  let r = empty<B>()
  for (const k of self) {
    r = concat_(r, f(k))
  }
  return r
}

/**
 * Returns a chunk with the elements mapped by the specified function.
 *
 * @dataFirst chain_
 */
export function chain<A, B>(f: (a: A) => Chunk<B>): (self: Chunk<A>) => Chunk<B> {
  return (self) => chain_(self, f)
}

/**
 * Flattens a chunk of chunks into a single chunk by concatenating all chunks.
 */
export function flatten<A>(self: Chunk<Chunk<A>>): Chunk<A> {
  return chain_(self, identity)
}

/**
 * Determines whether this chunk and the specified chunk have the same length
 * and every pair of corresponding elements of this chunk and the specified
 * chunk satisfy the specified predicate.
 */
export function corresponds_<A, B>(
  self: Chunk<A>,
  that: Chunk<B>,
  f: (a: A, b: B) => boolean
): boolean {
  if (self.length !== that.length) {
    return false
  }

  const leftIterator = self.arrayLikeIterator()
  const rightIterator = that.arrayLikeIterator()

  let i = 0
  let j = 0
  let equal = true
  let done = false
  let leftLength = 0
  let rightLength = 0
  let left: ArrayLike<A> | undefined = undefined
  let right: ArrayLike<B> | undefined = undefined

  while (equal && !done) {
    if (i < leftLength && j < rightLength) {
      if (!f(left![i]!, right![j]!)) {
        equal = false
      }
      i++
      j++
    } else {
      let cnt = true
      if (i === leftLength) {
        const leftNext = leftIterator.next()
        if (!leftNext.done) {
          left = leftNext.value
          leftLength = left.length
          i = 0
          cnt = false
        }
      }
      if (cnt && j === rightLength) {
        const rightNext = rightIterator.next()
        if (!rightNext.done) {
          right = rightNext.value
          rightLength = right.length
          j = 0
          cnt = false
        }
      }
      if (cnt && i === leftLength && j === rightLength) {
        done = true
        cnt = false
      }
      if (cnt) {
        equal = false
      }
    }
  }

  return equal
}

/**
 * Determines whether this chunk and the specified chunk have the same length
 * and every pair of corresponding elements of this chunk and the specified
 * chunk satisfy the specified predicate.
 *
 * @dataFirst corresponds_
 */
export function corresponds<A, B>(
  that: Chunk<B>,
  f: (a: A, b: B) => boolean
): (self: Chunk<A>) => boolean {
  return (self) => corresponds_(self, that, f)
}
