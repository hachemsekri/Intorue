import { citySvg } from '@/components/home/city';

/**
 * Cached city illustrations for the home page (drawn once at build time).
 *   /illustrations/city-hero.svg · city-follow.svg (map fallback)
 */
const VARIANTS: Record<string, () => string> = {
  'city-hero.svg': () => citySvg(11),
  'city-follow.svg': () => citySvg(29),
};

export const dynamic = 'force-static';

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((name) => ({ name }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const make = VARIANTS[name];
  if (!make) return new Response('Not found', { status: 404 });
  return new Response(make(), {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' },
  });
}
