import { brand } from '@winou/config';

/** Wordmark in the style of the reference designs: first part solid, second part turquoise. */
export function Wordmark({ tone = 'light', className = '' }: { tone?: 'light' | 'dark'; className?: string }) {
  const [a, b] = brand.wordmark;
  return (
    <span className={`ltr-isolate inline-block text-[26px] font-extrabold tracking-tight ${className}`} aria-label={brand.name}>
      <span aria-hidden className={tone === 'light' ? 'text-white' : 'text-navy'}>
        {a}
      </span>
      <span aria-hidden className={tone === 'light' ? 'text-teal' : 'text-teal-dark'}>
        {b}
      </span>
    </span>
  );
}
