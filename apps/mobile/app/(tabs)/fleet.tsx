import { VEHICLE_TYPES, type VehicleType } from '@winou/shared';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {statusColor, useStyles, useTheme} from '@/components/ui';
import { PlateText } from '@/components/VehicleBits';
import { useI18n } from '@/lib/i18n';
import { useLiveVehicles } from '@/lib/live';
import { useSession } from '@/lib/session';

export default function Fleet() {
  const { T } = useTheme();
  const s = useStyles();
  const { t, formatRelative } = useI18n();
  const { org } = useSession();
  const { vehicles, reload } = useLiveVehicles(org?.orgId);
  const [q, setQ] = useState('');
  const [type, setType] = useState<VehicleType | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return vehicles.filter((v) => (type === 'all' || v.type === type) && (!n || v.name.toLowerCase().includes(n) || v.plate.toLowerCase().includes(n)));
  }, [vehicles, q, type]);
  const counts = { moving: 0, stopped: 0, offline: 0 } as Record<string, number>;
  vehicles.forEach((v) => (counts[v.status] = (counts[v.status] ?? 0) + 1));

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <FlatList
        data={shown}
        keyExtractor={(v) => v.vehicleId}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await reload().catch(() => {});
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={s.h1} accessibilityRole="header">
              {t('map.panelTitle')}
            </Text>
            <View style={[s.row, { gap: 8 }]}>
              {(['moving', 'stopped', 'offline'] as const).map((k) => (
                <View key={k} style={[s.card, { flex: 1, padding: 12, backgroundColor: k === 'offline' && counts.offline ? T.warnbg : '#fff' }]}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: k === 'offline' && counts.offline ? T.warn : T.ink }}>{counts[k] ?? 0}</Text>
                  <Text style={s.muted}>{t(`map.kpis.${k}`)}</Text>
                </View>
              ))}
            </View>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t('map.searchPlaceholder')}
              accessibilityLabel={t('common.search')}
              placeholderTextColor="#94A0AE"
              style={s.input}
            />
            <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
              {(['all', ...VEHICLE_TYPES] as const).map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityState={{ selected: type === k }}
                  onPress={() => setType(k)}
                  style={{ paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: type === k ? T.ink : T.line, backgroundColor: type === k ? T.ink : '#fff' }}
                >
                  <Text style={{ color: type === k ? '#fff' : T.ink, fontWeight: type === k ? '700' : '400', fontSize: 15 }}>
                    {k === 'all' ? t('common.all') : t(`vehicles.typesPlural.${k}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={[s.muted, { padding: 24, textAlign: 'center' }]}>{t('map.empty')}</Text>}
        renderItem={({ item: v }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${v.name}, ${t(`map.statuses.${v.status}`)}`}
            onPress={() => router.push(`/vehicle/${v.vehicleId}`)}
            style={({ pressed }) => [s.row, { backgroundColor: pressed ? T.bg : '#fff', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.line, gap: 12 }]}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor(T)[v.status] }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: T.ink }}>{v.name}</Text>
              <PlateText plate={v.plate} format={v.plateFormat} style={s.muted} />
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: statusColor(T)[v.status], fontWeight: '600' }}>{t(`map.statuses.${v.status}`)}</Text>
              <Text style={s.muted}>
                {v.status === 'moving' && v.position ? `${Math.round(v.position.speedKmh)} ${t('map.kmh')}` : v.device?.lastSeenAt ? formatRelative(v.device.lastSeenAt) : '—'}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
