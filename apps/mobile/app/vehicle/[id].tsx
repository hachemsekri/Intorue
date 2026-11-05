import type { TripsReportDto } from '@winou/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { MapWeb, type MapHandle } from '@/components/MapWeb';
import {Card, statusColor, useStyles, useTheme} from '@/components/ui';
import { PlateText } from '@/components/VehicleBits';
import { useI18n } from '@/lib/i18n';
import { useApi, useSession } from '@/lib/session';

const DAY = 86_400_000;

/** Midnight in Tunis (fixed UTC+1, Tunisia has no daylight saving time). */
function startOfTodayTunis(): Date {
  const now = new Date(Date.now() + 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 3600_000);
}

let numberLocale = 'fr-TN';
function km(m: number) {
  const nf = new Intl.NumberFormat(numberLocale, { maximumFractionDigits: m < 100_000 ? 1 : 0 });
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${nf.format(m / 1000)} km`;
}
function dur(sec: number) {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/** Vehicle details and today's trips: KPIs, route, timeline. */
export default function VehicleScreen() {
  const { T } = useTheme();
  const s = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, formatTime } = useI18n();
  numberLocale = locale === 'ar' ? 'ar-TN-u-nu-latn' : locale === 'en' ? 'en-GB' : 'fr-TN';
  const { org } = useSession();
  const range = useMemo(() => {
    const from = startOfTodayTunis();
    return { from: from.toISOString(), to: new Date(from.getTime() + DAY).toISOString() };
  }, []);
  const report = useApi<TripsReportDto>(org && id ? `/orgs/${org.orgId}/vehicles/${id}/trips?from=${range.from}&to=${range.to}` : null);
  const map = useRef<MapHandle>(null);
  const r = report.data;

  useEffect(() => {
    if (!r) return;
    map.current?.post({
      type: 'route',
      paths: r.trips.map((x) => x.path),
      points: [
        ...r.trips.map((x) => ({ lon: x.start.lon, lat: x.start.lat, color: T.ink })),
        ...r.trips.map((x) => ({ lon: x.end.lon, lat: x.end.lat, color: T.moving })),
        ...r.events.filter((e) => e.position).map((e) => ({ lon: e.position!.lon, lat: e.position!.lat, color: T.warn })),
      ],
    });
  }, [r]);

  type Item = { at: string; title: string; sub: string; warn?: boolean };
  const items: Item[] = [];
  r?.trips.forEach((x, i) => {
    items.push({ at: x.startedAt, title: `${t('trips.departure')} · ${t('trips.trip', { n: i + 1 })}`, sub: `${x.start.place ?? t('trips.placeUnknown')} · ${km(x.distanceM)} · ${dur(x.durationS)}` });
    items.push({ at: x.endedAt, title: x.ongoing ? t('trips.currentPosition') : t('trips.arrival'), sub: x.end.place ?? t('trips.placeUnknown') });
  });
  r?.stops.forEach((x) => items.push({ at: x.startedAt, title: t('trips.stop', { duration: dur(x.durationS) }), sub: x.place ?? t('trips.placeUnknown') }));
  r?.events.forEach((e) => items.push({ at: e.occurredAt, title: t(`alerts.types.${e.type}`), sub: e.vehicle.name, warn: true }));
  items.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <Stack.Screen options={{ headerTitle: r?.vehicle.name ?? '', headerBackTitle: t('mobile.tabs.map') }} />
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {r && (
          <View>
            <Text style={s.h1}>{r.vehicle.name}</Text>
            <PlateText plate={r.vehicle.plate} format={/TUN/.test(r.vehicle.plate) ? 'tn_standard' : 'other'} style={[s.muted, { fontSize: 17 }]} />
          </View>
        )}
        <Text style={s.h2}>{t('mobile.tripsToday')}</Text>
        <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Kpi label={t('trips.distance')} value={r ? km(r.summary.distanceM) : '—'} />
          <Kpi label={t('trips.drivingTime')} value={r ? dur(r.summary.drivingS) : '—'} />
          <Kpi label={t('trips.maxSpeed')} value={r ? `${r.summary.maxSpeedKmh} km/h` : '—'} />
          <Kpi label={t('trips.events')} value={r ? String(r.summary.events) : '—'} warn={!!r?.summary.events} />
        </View>
        <View style={{ height: 280, borderRadius: 16, overflow: 'hidden', backgroundColor: T.surf }}>
          <MapWeb ref={map} locale={locale} />
        </View>
        <Card style={{ gap: 0 }}>
          <Text style={[s.h2, { marginBottom: 8 }]}>{t('trips.timeline')}</Text>
          {r && items.length === 0 && <Text style={s.muted}>{t('trips.noTrips')}</Text>}
          {items.map((it, i) => (
            <View key={i} style={[s.row, { alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: T.line }]}>
              <Text style={[s.muted, { width: 48, fontWeight: '600' }]}>{formatTime(it.at)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: it.warn ? T.warn : T.ink }}>{it.title}</Text>
                <Text style={s.muted}>{it.sub}</Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </>
  );
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const { T } = useTheme();
  const s = useStyles();
  return (
    <View style={[s.card, { width: '48.5%', padding: 12, backgroundColor: warn ? T.warnbg : '#fff' }]}>
      <Text style={[s.muted, warn ? { color: T.warn } : null]}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: warn ? T.warn : T.ink }}>{value}</Text>
    </View>
  );
}
