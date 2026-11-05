import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, type ComponentType } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { WEB_URL } from '@/lib/config';
import { useTheme } from '@/lib/theme';

// react-native-webview's class typings do not line up with the React 19.3 types yet.
const WV = WebView as unknown as ComponentType<Record<string, unknown>>;

export interface MapHandle {
  post: (msg: object) => void;
}

/**
 * The self-hosted MapLibre map (web app page /embed/map) inside a WebView, or an iframe in the
 * web preview. Same basemap, attribution and Arabic labels as the website; no Google Maps key.
 */
export const MapWeb = forwardRef<MapHandle, { locale: string; onReady?: () => void; onSelect?: (id: string) => void }>(function MapWeb(
  { locale, onReady, onSelect },
  ref,
) {
  const webview = useRef<WebView>(null);
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const queue = useRef<object[]>([]);
  const ready = useRef(false);
  const cb = useRef({ onReady, onSelect });
  cb.current = { onReady, onSelect };
  const { name: theme } = useTheme();
  const src = `${WEB_URL}/embed/map?lang=${locale}&theme=${theme}`;

  const send = (msg: object) => {
    const s = JSON.stringify(msg);
    if (Platform.OS === 'web') iframe.current?.contentWindow?.postMessage(s, WEB_URL);
    else webview.current?.postMessage(s);
  };
  useImperativeHandle(ref, () => ({
    post: (msg) => (ready.current ? send(msg) : queue.current.push(msg)),
  }));

  const handle = (raw: string) => {
    let m: { type?: string; id?: string };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.type === 'ready') {
      ready.current = true;
      queue.current.splice(0).forEach(send);
      cb.current.onReady?.();
    } else if (m.type === 'select' && m.id) cb.current.onSelect?.(m.id);
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin === WEB_URL && typeof e.data === 'string') handle(e.data);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1 }}>
        {createElement('iframe', { ref: iframe, src, title: 'map', style: { border: 0, width: '100%', height: '100%' } })}
      </View>
    );
  }
  return (
    <WV
      ref={webview}
      source={{ uri: src }}
      onMessage={(e: { nativeEvent: { data: string } }) => handle(e.nativeEvent.data)}
      originWhitelist={[WEB_URL]}
      setSupportMultipleWindows={false}
      javaScriptEnabled
      style={{ flex: 1 }}
    />
  );
});
