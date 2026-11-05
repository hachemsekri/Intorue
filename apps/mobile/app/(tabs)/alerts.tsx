import { formatPlate, type AlertDto } from '@winou/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {Badge, Button, Notice, statusColor, useStyles, useTheme} from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useApi, useSession } from '@/lib/session';

export default function Alerts() {
  const { T } = useTheme();
  const s = useStyles();
  const { t, locale, formatRelative, formatDateTime } = useI18n();
  const { org, can } = useSession();
  const [status, setStatus] = useState<'open' | 'handled'>('open');
  const list = useApi<AlertDto[]>(org ? `/orgs/${org.orgId}/alerts?status=${status}&limit=100` : null);
  const [error, setError] = useState<string | null>(null);

  const text = (a: AlertDto) => {
    const d = a.details as Record<string, string | number>;
    const plate = formatPlate(a.vehicle.plate, /TUN/.test(a.vehicle.plate) ? 'tn_standard' : 'other', locale);
    return t(`alerts.desc.${a.type}`, {
      plate,
      speed: d.speedKmh ?? '',
      limit: d.limitKmh ?? '',
      zone: d.geofenceName ?? '',
      time: d.localTime ?? '',
      pct: d.batteryPct ?? '',
      since: typeof d.lastSeenAt === 'string' ? formatDateTime(d.lastSeenAt) : '',
    });
  };

  async function handle(a: AlertDto) {
    try {
      await api(`/orgs/${org!.orgId}/alerts/${a.id}/handle`, { method: 'POST', body: {} });
      await list.reload();
    } catch {
      setError(t('errors.generic'));
    }
  }

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={list.loading} onRefresh={() => void list.reload()} />}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Text style={s.h1} accessibilityRole="header">
              {t('alerts.title')}
            </Text>
            <View style={[s.row, { gap: 8 }]}>
              {(['open', 'handled'] as const).map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: status === k }}
                  onPress={() => setStatus(k)}
                  style={{ paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: status === k ? T.ink : T.line, backgroundColor: status === k ? T.ink : '#fff' }}
                >
                  <Text style={{ color: status === k ? '#fff' : T.ink, fontWeight: '600' }}>{t(k === 'open' ? 'alerts.toHandle' : 'alerts.handled')}</Text>
                </Pressable>
              ))}
            </View>
            {error && <Notice tone="error" text={error} />}
          </View>
        }
        ListEmptyComponent={!list.loading ? <Text style={[s.muted, { textAlign: 'center', padding: 24 }]}>{t(status === 'open' ? 'alerts.none' : 'alerts.noneHandled')}</Text> : undefined}
        renderItem={({ item: a }) => (
          <View style={[s.card, { gap: 8 }]}>
            <View style={[s.row, { justifyContent: 'space-between', gap: 8 }]}>
              <Badge text={t(`alerts.severities.${a.severity}`)} color={a.severity === 'urgent' ? T.warn : T.ink} bg={a.severity === 'urgent' ? T.warnbg : T.infobg} />
              <Text style={s.muted}>{formatRelative(a.occurredAt)}</Text>
            </View>
            <Text style={{ fontSize: 17, fontWeight: '700', color: T.ink }}>
              {t(`alerts.types.${a.type}`)} · {a.vehicle.name}
            </Text>
            <Text style={s.muted}>{text(a)}</Text>
            {a.status === 'handled' && a.handledAt && (
              <Text style={[s.muted, { fontSize: 13 }]}>{t('alerts.handledBy', { name: a.handledBy?.name ?? '—', time: formatDateTime(a.handledAt) })}</Text>
            )}
            <View style={[s.row, { gap: 8, marginTop: 4 }]}>
              <Button title={t('alerts.viewOnMap')} onPress={() => router.navigate({ pathname: '/', params: { vehicle: a.vehicle.id } })} style={{ flex: 1, minHeight: 46 }} />
              {a.status === 'open' && can('alerts.handle') && (
                <Button title={t('alerts.markHandled')} variant="secondary" onPress={() => void handle(a)} style={{ flex: 1, minHeight: 46 }} />
              )}
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
