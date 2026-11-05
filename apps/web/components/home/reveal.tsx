'use client';

import { useEffect } from 'react';

/**
 * Entrance motion for the home page: elements marked data-reveal rise in once as their
 * section enters, staggered by their data-reveal index. Content is visible without script
 * (the hidden state is only applied once this runs) and with reduced motion.
 */
export function Reveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9) return; // already on screen: leave it be
      el.classList.add('reveal-wait');
      el.style.transitionDelay = `${Number(el.dataset.reveal || 0) * 75}ms`;
    });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.remove('reveal-wait');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    els.forEach((el) => el.classList.contains('reveal-wait') && io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
