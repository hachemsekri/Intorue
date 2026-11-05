import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapWeb, type MapHandle } from '@/components/MapWeb';
import {Button, Wordmark, statusColor, useStyles, useTheme} from '@/components/ui';
import { PlateText, StatusBadge } from '@/components/VehicleBits';
import { useI18n } from '@/lib/i18n';
import { useLiveVehicles, type LiveVehicle } from '@/lib/live';
import { useSession } from '@/lib/session';

const shortName = (v: LiveVehicle) =>
  v.type === 'scooter' && v.plateFormat === 'other' ? v.plate : v.name.split(' ').length > 1 && v.name.split(' ')[0]!.length > 2 ? v.name.split(' ').slice(1).join(' ') : v.name;

/** Mobile design: full-screen map, brand bar with alert count, bottom sheet for the selected vehicle. */
export default function MapScreen() {
  const { T } = useTheme();
  const s = useStyles();
  const { t, locale, formatRelative, formatTime } = useI18n();
  const { org } = useSession();
  const { vehicles } = useLiveVehicles(org?.orgId);
  const params = useLocalSearchParams<{ vehicle?: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(params.vehicle ?? null);
  const map = useRef<MapHandle>(null);
  const selected = vehicles.find((v) => v.vehicleId === selectedId) ?? null;

  useEffect(() => {
    if (params.vehicle) setSelectedId(params.vehicle);
  }, [params.vehicle]);

  const markers = useMemo(
    () =>
      vehicles
        .filter((v) => v.position)
        .map((v) => ({ id: v.vehicleId, label: shortName(v), color: statusColor(T)[v.status], lon: v.position!.lon, lat: v.position!.lat, selected: v.vehicleId === selectedId })),
    [vehicles, selectedId],
  );
  useEffect(() => {
    map.current?.post({ type: 'vehicles', vehicles: markers });
  }, [markers]);
  useEffect(() => {
    if (selected?.position) map.current?.post({ type: 'focus', lon: selected.position.lon, lat: selected.position.lat });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = selected?.position;
  const since = p ? (selected!.status === 'moving' ? p.movingSince : selected!.status === 'stopped' ? p.stoppedSince : null) : null;

  return (
    <View style={{ flex: 1 }}>
      <MapWeb ref={map} locale={locale} onSelect={setSelectedId} />
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 16, right: 16 }} pointerEvents="box-none">
        <View style={[s.card, s.row, { justifyContent: 'space-between', marginTop: 8, paddingVertical: 14, elevation: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8 }]}>
          <Wordmark />
          <Text style={[s.muted, { flexShrink: 1, textAlign: 'right' }]} numberOfLines={1}>
            {org?.orgName.replace('[DÉMO] ', '')}
          </Text>
        </View>
      </SafeAreaView>

      {selected && (
        <View
          accessibilityViewIsModal={false}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: T.surf, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12, elevation: 12, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12 }}
        >
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: T.line }} />
          <View style={[s.row, { justifyContent: 'space-between', gap: 8 }]}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: T.ink }} accessibilityRole="header">
                {selected.name}
              </Text>
              <PlateText plate={selected.plate} format={selected.plateFormat} style={[s.muted, { fontSize: 17 }]} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('map.closeDetails')} onPress={() => setSelectedId(null)} hitSlop={12}>
              <Text style={{ fontSize: 22, color: T.sub }}>✕</Text>
            </Pressable>
          </View>
          <StatusBadge status={selected.status} extra={since ? t('map.since', { time: formatTime(since) }) : undefined} />
          <View style={{ height: 1, backgroundColor: T.line }} />
          <View style={[s.row, { flexWrap: 'wrap', rowGap: 12 }]}>
            <Info label={t('map.speed')} value={p ? `${Math.round(p.speedKmh)} ${t('map.kmh')}` : '—'} />
            <Info label={t('map.lastUpdate')} value={selected.device?.lastSeenAt ? formatRelative(selected.device.lastSeenAt) : '—'} />
            <Info label={t('map.battery')} value={selected.device?.batteryPct != null ? `${selected.device.batteryPct} %` : '—'} />
            <Info label={t('map.device')} value={selected.device?.imei ?? '—'} />
          </View>
          <View style={[s.row, { gap: 10 }]}>
            <Button title={t('map.viewTrip')} onPress={() => router.push(`/vehicle/${selected.vehicleId}`)} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const { T } = useTheme();
  const s = useStyles();
  return (
    <View style={{ width: '50%' }}>
      <Text style={s.muted}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: T.ink }}>{value}</Text>
    </View>
  );
}
