import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { UButton, UCard, UHeader, UScreen, UText, usePalette } from '@/components/umpire-ui';
import { useT } from '@/lib/i18n';
import { font } from '@/theme';

/** Instructions for scoring on paper when the phone or the app stops working. */
export default function PaperScreen() {
  const t = useT();
  const p = usePalette();
  const params = useLocalSearchParams<{ matchNumber?: string; courtNumber?: string }>();
  const steps = [
    t(
      'Write each point on the paper sheet for this match. Mark the winning side and the score after every point.',
    ),
    t('Write the final score and sign the sheet.'),
    t(
      'Hand the sheet to the match desk. The desk enters the score on the website and marks it as entered from paper.',
    ),
  ];
  return (
    <UScreen scroll>
      <UHeader
        eyebrow={t('Umpire')}
        title={t('Score on paper')}
        sub={t('Use this only if the phone or the app stops working.')}
      />
      <UCard strong>
        <UText muted size={13}>
          {t('Match #{number}', { number: params.matchNumber ?? '' })}
          {params.courtNumber ? ` · ${t('Court {number}', { number: params.courtNumber })}` : ''}
        </UText>
      </UCard>
      <UCard>
        {steps.map((step, i) => (
          <View key={i} style={styles.step}>
            <View style={[styles.num, { borderColor: p.accent }]}>
              <Text style={[styles.numText, { color: p.fg }]}>{i + 1}</Text>
            </View>
            <View style={styles.flex}>
              <UText>{step}</UText>
            </View>
          </View>
        ))}
      </UCard>
      <View style={styles.bottom}>
        <UButton variant="text" title={t('Back to scoring')} onPress={() => router.back()} />
      </View>
    </UScreen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  flex: { flex: 1 },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: { fontSize: 13, fontFamily: font.bold },
  bottom: { marginTop: 'auto' },
});
