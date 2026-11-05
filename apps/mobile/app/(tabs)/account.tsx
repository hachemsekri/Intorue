import type { SupportedLocale } from '@winou/i18n';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {Button, Card, Notice, Pill, statusColor, useStyles, useTheme} from '@/components/ui';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { useI18n } from '@/lib/i18n';
import { registerForPush, type PushStatus } from '@/lib/push';
import { useSession } from '@/lib/session';

const LANGS: { code: SupportedLocale; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
];

export default function Account() {
  const { T, choice, setChoice } = useTheme();
  const s = useStyles();
  const { t, locale, setLocale } = useI18n();
  const { me, org, switchOrg, signOut } = useSession();
  const [push, setPush] = useState<PushStatus | null>(null);
  const [prefs, setPrefs] = useState<{ enabled: boolean; urgentOnly: boolean } | null>(null);

  useEffect(() => {
    void registerForPush(locale).then(setPush);
  }, [locale]);
  useEffect(() => {
    if (!org) return;
    void api<{ enabled: boolean; urgentOnly: boolean }>(`/orgs/${org.orgId}/push-preferences`).then(setPrefs).catch(() => {});
  }, [org]);

  async function save(next: { enabled: boolean; urgentOnly: boolean }) {
    setPrefs(next);
    if (org) await api(`/orgs/${org.orgId}/push-preferences`, { method: 'PUT', body: next }).catch(() => {});
  }

  return (
    <SafeAreaView edges={['top']} style={s.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={s.h1} accessibilityRole="header">
          {t('mobile.tabs.account')}
        </Text>
        <Card style={{ gap: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: T.ink }}>{me?.name}</Text>
          <Text style={s.muted}>{me?.email}</Text>
          {org && (
            <Text style={s.muted}>
              {org.orgName} · {t(`members.roles.${org.role}`)}
            </Text>
          )}
        </Card>

        {me && me.memberships.length > 1 && (
          <Card style={{ gap: 8 }}>
            <Text style={s.h2}>{t('common.organization')}</Text>
            {me.memberships.map((m) => (
              <Pressable
                key={m.orgId}
                accessibilityRole="radio"
                accessibilityState={{ checked: m.orgId === org?.orgId }}
                onPress={() => void switchOrg(m.orgId)}
                style={[s.row, { minHeight: 44, gap: 10 }]}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: T.ink, alignItems: 'center', justifyContent: 'center' }}>
                  {m.orgId === org?.orgId && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: T.ink }} />}
                </View>
                <Text style={{ color: T.ink, fontSize: 16 }}>{m.orgName}</Text>
              </Pressable>
            ))}
          </Card>
        )}

        <Card style={{ gap: 12 }}>
          <Text style={s.h2}>{t('mobile.notifications')}</Text>
          {push && <Notice text={t(`mobile.push.${push}`)} tone={push === 'registered' ? 'info' : push === 'error' ? 'error' : 'info'} />}
          {prefs && (
            <>
              <View style={[s.row, { justifyContent: 'space-between', gap: 12 }]}>
                <Text style={{ flex: 1, color: T.ink, fontSize: 16 }}>{t('mobile.receive')}</Text>
                <Switch accessibilityLabel={t('mobile.receive')} value={prefs.enabled} onValueChange={(v) => void save({ ...prefs, enabled: v })} />
              </View>
              <View style={[s.row, { justifyContent: 'space-between', gap: 12 }]}>
                <Text style={{ flex: 1, color: T.ink, fontSize: 16 }}>{t('mobile.urgentOnly')}</Text>
                <Switch accessibilityLabel={t('mobile.urgentOnly')} value={prefs.urgentOnly} disabled={!prefs.enabled} onValueChange={(v) => void save({ ...prefs, urgentOnly: v })} />
              </View>
            </>
          )}
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={s.h2}>{t('common.language')}</Text>
          {LANGS.map((l) => (
            <Pressable
              key={l.code}
              accessibilityRole="radio"
              accessibilityState={{ checked: l.code === locale }}
              onPress={() => void setLocale(l.code)}
              style={[s.row, { minHeight: 44, gap: 10 }]}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: T.ink, alignItems: 'center', justifyContent: 'center' }}>
                {l.code === locale && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: T.ink }} />}
              </View>
              <Text style={{ color: T.ink, fontSize: 16 }}>{l.label}</Text>
            </Pressable>
          ))}
          <Text style={[s.muted, { fontSize: 12 }]}>{t('mobile.restartForDirection')}</Text>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={s.h2}>{t('mobile.theme')}</Text>
          <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
            {([null, 'light', 'dark'] as const).map((c) => (
              <Pill key={c ?? 'device'} label={t(c === null ? 'mobile.themeDevice' : c === 'light' ? 'mobile.themeLight' : 'mobile.themeDark')} on={choice === c} onPress={() => setChoice(c)} />
            ))}
          </View>
        </Card>

        <Card style={{ gap: 8 }}>
          <Text style={s.h2}>{t('settings.privacy')}</Text>
          <Text style={s.muted}>{t('settings.privacyPlaceholder')}</Text>
        </Card>

        <Button title={t('nav.signOut')} variant="secondary" onPress={() => void signOut()} />
        <Text style={[s.muted, { fontSize: 12, textAlign: 'center' }]}>{t('mobile.server', { url: API_URL })}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
