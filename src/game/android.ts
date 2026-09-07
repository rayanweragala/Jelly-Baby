import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { diagnostic } from './diagnostics.ts';

export function nativeDiagnostics() {
  if (!Capacitor.isNativePlatform()) return;
  diagnostic('Platform', 'Android WebView / Capacitor');
  const info = registerPlugin<{ getInfo: () => Promise<Record<string, string>> }>(
    'JellyDiagnostics',
  );
  void info
    .getInfo()
    .then((values) => {
      for (const [name, value] of Object.entries(values)) diagnostic(name, value);
    })
    .catch((error) => diagnostic('Native version information', String(error)));
}

export async function androidLifecycle(setActive: (active: boolean) => void, back: () => boolean) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const state = await App.addListener('appStateChange', ({ isActive }) => setActive(isActive));
  const navigation = await App.addListener('backButton', () => {
    if (!back()) void App.exitApp().catch((error) => diagnostic('Back navigation', String(error)));
  });
  const initial = await App.getState();
  setActive(initial.isActive);
  return () => {
    void state.remove();
    void navigation.remove();
  };
}
