"use client";

import { useEffect, useState } from "react";

// Run `onChange` during render when `value` changes (compared with Object.is).
// This is React's "adjusting state when a prop changes" pattern
// (https://react.dev/learn/you-might-not-need-an-effect) - use it instead of
// `useEffect(() => setX(...), [value])`, which renders once with stale state
// and then again. `onChange` may only set state of the calling component.
// For several inputs, pass a primitive key (e.g. JSON.stringify([a, b])) -
// a fresh array/object each render would count as a change every time.
export function useOnChange<T>(value: T, onChange: (value: T) => void): void {
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    onChange(value);
  }
}

// Current time in ms, re-read every `intervalMs`. Use instead of calling
// Date.now() during render (impure; also re-computes differently on every
// render). Only for display-grade "how long ago" / "this week" maths.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
