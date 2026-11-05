'use client';

import { useEffect, useRef } from 'react';

/**
 * One passive scroll/resize listener for the whole page, batched into one animation frame.
 * Components subscribe with useScrollFrame; everything is removed on unmount.
 */
type Fn = () => void;
const subscribers = new Set<Fn>();
let scheduled = false;
let raf = 0;
let fallback: ReturnType<typeof setTimeout> | undefined;

function run() {
  scheduled = false;
  cancelAnimationFrame(raf);
  clearTimeout(fallback);
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* an animation error must never break the page */
    }
  });
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  raf = requestAnimationFrame(run);
  // If no frame comes (a paused or throttled page), still update, so the page never stays stuck.
  fallback = setTimeout(run, 150);
}

export function useScrollFrame(fn: Fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const call = () => ref.current();
    if (subscribers.size === 0) {
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
    }
    subscribers.add(call);
    schedule();
    return () => {
      subscribers.delete(call);
      if (subscribers.size === 0) {
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
      }
    };
  }, []);
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
