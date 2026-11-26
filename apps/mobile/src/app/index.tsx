import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';

import { useSession } from '@/lib/session';
import { splashBackground } from '@/theme';

// The clip is about 10 seconds. Give it a little extra time so a stalled video cannot keep the user here.
const MAX_SPLASH_MS = 12000;

/** Launch screen. Plays the brand animation once, then moves to Home or Welcome depending on the session. */
export default function SplashScreen() {
  const { profile } = useSession();
  const profileRef = useRef(profile);

  const player = useVideoPlayer(require('../../assets/brand/splash-animation.mp4'), (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.play();
  });

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      router.replace(profileRef.current ? '/(app)/(tabs)' : '/welcome');
    };
    const subscription = player.addListener('playToEnd', finish);
    const timer = setTimeout(finish, MAX_SPLASH_MS);
    return () => {
      subscription.remove();
      clearTimeout(timer);
    };
  }, [player]);

  return (
    <View style={styles.container}>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: splashBackground },
  video: { flex: 1 },
});
