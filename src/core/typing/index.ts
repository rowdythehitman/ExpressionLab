// Port type resolution helpers (spec §6).
import type { PortType, ValueType } from '../types';

export type Bindings = Partial<Record<string, ValueType>>;

const PROP = /^property<(.+)>$/;

export function isProperty(t: PortType | string): boolean {
  return PROP.test(t);
}

/** The value type inside `property<X>`, or the type itself. */
export function innerType(t: string): string {
  return PROP.exec(t)?.[1] ?? t;
}

/** Replaces generics ('T', 'V', ...) with their bindings; unbound generics stay as-is. */
export function substitute(t: PortType | string, b: Bindings): string {
  const inner = innerType(t);
  const resolved = b[inner] ?? inner;
  return isProperty(t) ? `property<${resolved}>` : resolved;
}

export function isGeneric(t: string): boolean {
  return /^[A-Z]$/.test(innerType(t));
}

const NUMERIC: ReadonlySet<string> = new Set(['number', 'vec2', 'vec3', 'color']);

/** True when both sides are numeric-ish values that only differ in dimension. */
export function isDimensionMismatch(a: string, b: string): boolean {
  return a !== b && NUMERIC.has(innerType(a)) && NUMERIC.has(innerType(b)) && isProperty(a) === isProperty(b);
}

/** Exact match after resolution; an unbound generic on either side is accepted (resolved later). */
export function typesCompatible(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  if (isProperty(expected) !== isProperty(actual)) return false;
  return isGeneric(expected) || isGeneric(actual);
}
