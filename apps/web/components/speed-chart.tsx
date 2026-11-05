'use client';

import type { TripDto } from '@winou/shared';
import { useI18n } from '@/lib/i18n';

const W = 800;
const H = 150;
const PAD_TOP = 22;
const PAD_BOTTOM = 8;

/**
 * Speed over the selected period (or trip), from each trip's recorded speeds. Time runs left to
 * right in both languages, like a clock; gaps between trips stay empty. The dashed line is the
 * speed limit that applies to this vehicle, and the peak is marked with its value.
 */
export function SpeedChart({ trips, limitKmh }: { trips: TripDto[]; limitKmh: number }) {
  const { t, formatTime } = useI18n();
  const withData = trips.filter((tr) => tr.speeds?.length);
  if (!withData.length) return <p className="py-10 text-center text-muted">{t('trips.noSpeed')}</p>;

  const t0 = new Date(withData[0]!.startedAt).getTime();
  const t1 = Math.max(...withData.map((tr) => new Date(tr.startedAt).getTime() + (tr.speeds[tr.speeds.length - 1]?.[0] ?? 0) * 1000));
  const span = Math.max(1, t1 - t0);
  const maxV = Math.max(limitKmh, ...withData.flatMap((tr) => tr.speeds.map((p) => p[1]))) * 1.08;
  const x = (ms: number) => ((ms - t0) / span) * W;
  const y = (v: number) => PAD_TOP + (1 - v / maxV) * (H - PAD_TOP - PAD_BOTTOM);

  let peak = { v: -1, ms: t0 };
  const paths = withData.map((tr) => {
    const start = new Date(tr.startedAt).getTime();
    return tr.speeds
      .map(([s, v], i) => {
        const ms = start + s * 1000;
        if (v > peak.v) peak = { v, ms };
        return `${i ? 'L' : 'M'}${x(ms).toFixed(1)} ${y(v).toFixed(1)}`;
      })
      .join('');
  });
  const px = x(peak.ms);
  const py = y(peak.v);
  const over = peak.v > limitKmh;
  const label = t('trips.speedChartLabel', { max: peak.v, time: formatTime(new Date(peak.ms)), limit: limitKmh });

  // Lines stretch to the card width; the dot and labels are HTML so they never distort.
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div role="img" aria-label={label} className="relative mt-2 h-[150px] w-full" style={{ direction: 'ltr' }}>
      <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <path d={`M0 ${y(limitKmh)}H${W}`} stroke="var(--sub)" strokeWidth="2" strokeDasharray="6 6" fill="none" vectorEffect="non-scaling-stroke" />
        {paths.map((d, i) => (
          <path key={i} d={d} stroke="var(--map-route)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <span aria-hidden className="absolute start-1 -translate-y-full pb-0.5 text-[13px] font-medium text-muted" style={{ top: pct(y(limitKmh), H) }}>
        {limitKmh}
      </span>
      <span
        aria-hidden
        className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: pct(px, W), top: pct(py, H), background: over ? 'var(--warn)' : 'var(--ink)' }}
      />
      <span
        aria-hidden
        className="absolute -translate-y-1/2 ps-3 text-base font-extrabold"
        style={{ left: pct(Math.min(px, W - 50), W), top: pct(Math.max(py, 14), H) }}
      >
        {peak.v}
      </span>
    </div>
  );
}
