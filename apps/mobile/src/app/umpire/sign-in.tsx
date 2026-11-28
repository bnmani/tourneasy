import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UButton, UHeader, UScreen, UText, usePalette } from '@/components/umpire-ui';
import { ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { extractQrToken } from '@/lib/qr';
import { useUmpire } from '@/lib/umpire-session';
import { font } from '@/theme';

const PIN_LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

export default function UmpireSignInScreen() {
  const t = useT();
  const p = usePalette();
  const { signInWithPin, signInWithQr } = useUmpire();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 429) setError(t('Too many tries. Wait a moment.'));
    else if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 422))
      setError(t('That PIN or QR code was not accepted.'));
    else setError(t('Could not sign in. Check your connection and try again.'));
  };

  const submitPin = async () => {
    if (pin.length !== PIN_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPin(pin);
      setPin('');
      router.replace('/umpire/courts');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const onScanned = async (data: string) => {
    if (handled.current) return;
    handled.current = true;
    // The token is read from the link and used once, in the request body.
    const token = extractQrToken(data);
    setScanning(false);
    if (!token) {
      setError(t('That is not a Tourneasy umpire QR code.'));
      handled.current = false;
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInWithQr(token);
      router.replace('/umpire/courts');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      handled.current = false;
    }
  };

  const startScan = async () => {
    setError(null);
    const granted = permission?.granted ? permission : await requestPermission();
    if (granted.granted) setScanning(true);
    else setError(t('Allow the camera to scan the QR code, or enter the PIN.'));
  };

  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'clear') setPin('');
    else if (key === 'back') setPin((v) => v.slice(0, -1));
    else setPin((v) => (v.length < PIN_LENGTH ? v + key : v));
  };

  if (scanning) {
    return (
      <UScreen>
        <UHeader
          title={t("Scan admin's QR code")}
          sub={t('Hold the code inside the camera view.')}
        />
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => void onScanned(data)}
          />
        </View>
        <UButton title={t('Cancel')} onPress={() => setScanning(false)} />
      </UScreen>
    );
  }

  return (
    <UScreen scroll>
      <UHeader
        eyebrow={t('Tourneasy · Umpire')}
        title={t('Sign in to your court')}
        sub={t('Enter the PIN from your tournament admin, or scan their QR code.')}
      />
      <View
        accessible
        accessibilityLabel={t('{count} of {total} digits entered', {
          count: pin.length,
          total: PIN_LENGTH,
        })}
        style={styles.pinRow}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View
            key={i}
            style={[styles.pinBox, { borderColor: i < pin.length ? p.accent : p.border }]}
          >
            <Text style={[styles.pinText, { color: p.fg }]}>{i < pin.length ? '•' : ''}</Text>
          </View>
        ))}
      </View>
      <View style={styles.keys}>
        {KEYS.map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={key === 'clear' ? t('Clear') : key === 'back' ? t('Delete') : key}
            onPress={() => press(key)}
            style={[styles.key, { borderColor: p.border }]}
          >
            <Text
              style={{
                color: key === 'clear' ? p.accent : p.fg,
                fontSize: key === 'clear' ? 14 : 22,
                fontFamily: font.medium,
              }}
            >
              {key === 'clear' ? t('Clear') : key === 'back' ? '⌫' : key}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <UText muted>{error}</UText> : null}
      <UButton
        title={t('Sign in')}
        onPress={() => void submitPin()}
        disabled={pin.length !== PIN_LENGTH}
        busy={busy}
      />
      <UButton title={t("Scan admin's QR code")} onPress={() => void startScan()} busy={busy} />
      <UText muted center size={13}>
        {t('No PIN yet? Ask your tournament admin.')}
      </UText>
    </UScreen>
  );
}

const styles = StyleSheet.create({
  pinRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  pinBox: {
    flex: 1,
    height: 60,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinText: { fontSize: 30, fontFamily: font.bold },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  key: {
    width: '31.5%',
    height: 56,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: { flex: 1, minHeight: 320, borderRadius: 16, overflow: 'hidden' },
});
