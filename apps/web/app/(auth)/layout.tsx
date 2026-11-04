import { Wordmark } from '@/components/brand';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Tagline } from '@/components/tagline';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(380px,44%)_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Wordmark />
        <MapArt />
        <Tagline />
      </aside>
      <main id="main" className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Wordmark tone="dark" />
          </span>
          <LocaleSwitcher />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}

/** Decorative map motif echoing the designs (streets, coastline, a route). */
function MapArt() {
  return (
    <svg aria-hidden className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
      <path d="M600 0 L600 420 C520 380 470 300 430 0 Z" fill="#14B8A6" opacity="0.18" />
      {[120, 260, 400, 540, 680].map((y) => (
        <path key={y} d={`M-20 ${y} L640 ${y + 60}`} stroke="#ffffff" strokeOpacity="0.07" strokeWidth="10" />
      ))}
      {[80, 220, 360, 500].map((x) => (
        <path key={x} d={`M${x} -20 L${x + 90} 820`} stroke="#ffffff" strokeOpacity="0.07" strokeWidth="10" />
      ))}
      <path d="M40 640 C160 520 220 380 330 420 S 470 300 560 180" stroke="#14B8A6" strokeWidth="7" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="640" r="10" fill="#0B2440" stroke="#fff" strokeWidth="3" />
      <circle cx="560" cy="180" r="10" fill="#14B8A6" stroke="#fff" strokeWidth="3" />
    </svg>
  );
}
