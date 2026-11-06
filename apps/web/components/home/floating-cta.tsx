'use client';

import { useEffect, useRef } from 'react';
import { useScrollFrame } from './scroll';

/**
 * Floating "request a quote": a button in the corner on desktop, a bar on phones. Appears after
 * the first screen; hidden while the price section, the final section or the footer is on screen.
 */
export function FloatingCta({ label, text }: { label: string; text: string }) {
  const box = useRef<HTMLDivElement>(null);
  const covered = useRef(false);

  const update = () => box.current?.classList.toggle('show', window.scrollY > window.innerHeight * 0.7 && !covered.current);
  useScrollFrame(update);

  useEffect(() => {
    const targets = [document.getElementById('offre'), document.querySelector('.closer'), document.querySelector('.ih footer')].filter((x): x is HTMLElement => !!x);
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      covered.current = visible.size > 0;
      box.current?.classList.toggle('show', window.scrollY > window.innerHeight * 0.7 && !covered.current);
    });
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return (
    <div className="sticky" ref={box}>
      <span>
        <strong>{text}</strong>
      </span>
      <a className="btn" href="#reserver">
        {label}
      </a>
    </div>
  );
}
