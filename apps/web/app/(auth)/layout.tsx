import Image from 'next/image';
import Link from 'next/link';
import { Wordmark } from '@/components/brand';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Tagline } from '@/components/tagline';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(380px,44%)_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy text-white lg:flex lg:flex-col lg:justify-between">
        <Image src="/home/avenue.jpg" alt="" fill sizes="44vw" priority className="object-cover" />
        <div aria-hidden className="absolute inset-0 bg-[rgb(11_36_64/0.62)]" />
        <Link href="/" className="relative p-10" aria-label="Intorue">
          <Wordmark />
        </Link>
        <div className="relative p-10">
          <Tagline />
        </div>
      </aside>
      <main id="main" className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" className="lg:hidden">
            <Wordmark tone="dark" />
          </Link>
          <LocaleSwitcher />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
