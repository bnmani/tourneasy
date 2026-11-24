import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Body, Button, Heading, Screen, TextLink } from '@/components/ui';
import { font, useColors } from '@/theme';

export default function WelcomeScreen() {
  const colors = useColors();
  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.header}>
          <Image
            accessibilityLabel="Tourneasy logo"
            source={require('../../assets/brand/logo.jpg')}
            style={styles.logo}
          />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>Welcome</Text>
          <Heading>Enter tournaments and follow your matches</Heading>
          <Body>
            Find a badminton tournament near you, see your schedule on court, and get a message when you are called.
          </Body>
        </View>
        <View style={styles.actions}>
          <Button title="Sign in" onPress={() => router.push('/signin')} />
          <Button title="Create an account" variant="secondary" onPress={() => router.push('/signup/name')} />
          <TextLink
            title="Browse tournaments without an account"
            onPress={() => Alert.alert('Coming soon', 'Public tournaments arrive in a later update.')}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 24 },
  header: { marginTop: 32 },
  logo: { width: 72, height: 72, borderRadius: 16 },
  copy: { gap: 12 },
  eyebrow: { fontSize: 14, fontFamily: font.semibold },
  actions: { flex: 1, justifyContent: 'flex-end', gap: 12 },
});
