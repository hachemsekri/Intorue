import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import {statusColor, useStyles, useTheme} from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { registerForPush } from '@/lib/push';
import { useSession } from '@/lib/session';

/** Bottom tabs as in the mobile design: Carte · Flotte · Alertes · Compte (text labels, no icon font). */
export default function TabsLayout() {
  const { T } = useTheme();
  const s = useStyles();
  const { t, locale } = useI18n();
  const { org } = useSession();
  const [open, setOpen] = useState(0);

  useEffect(() => {
    void registerForPush(locale);
  }, [locale]);

  useEffect(() => {
    if (!org) return;
    const load = () =>
      api<{ open: number }>(`/orgs/${org.orgId}/alerts/count`)
        .then((r) => setOpen(r.open))
        .catch(() => {});
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [org]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: T.ink,
        tabBarInactiveTintColor: T.sub,
        tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
        tabBarIconStyle: { display: 'none' },
        tabBarStyle: { height: 64, borderTopColor: T.line, backgroundColor: T.surf },
        tabBarItemStyle: { justifyContent: 'center' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('mobile.tabs.map') }} />
      <Tabs.Screen name="fleet" options={{ title: t('mobile.tabs.fleet') }} />
      <Tabs.Screen
        name="alerts"
        options={{ title: t('mobile.tabs.alerts'), tabBarBadge: open > 0 ? (open > 99 ? '99+' : open) : undefined, tabBarBadgeStyle: { backgroundColor: T.acc, color: T.onacc } }}
      />
      <Tabs.Screen name="account" options={{ title: t('mobile.tabs.account') }} />
    </Tabs>
  );
}
