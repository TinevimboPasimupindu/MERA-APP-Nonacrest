import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFonts, LibreBaskerville_700Bold } from '@expo-google-fonts/libre-baskerville';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS, getToken, clearTokens } from '../../services/api';
import { routeAfterAuth } from '../../utils/route-after-auth';

const { height } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    LibreBaskerville_700Bold,
  });
  const [checkingSession, setCheckingSession] = useState(true);

  // SC-01: on every app launch, restore an existing session automatically
  // rather than always showing this login splash — and if the
  // already-authenticated user has an in-progress emergency (active SOS /
  // assigned response), land them straight back in it via the same
  // routeAfterAuth() decision manual login uses, instead of dropping them
  // on the normal dashboard. No stored token, or a token that no longer
  // verifies (expired/deactivated/network failure) → fall through to the
  // normal splash below, same as any logged-out user.
  useEffect(() => {
    let cancelled = false;

    async function checkExistingSession() {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setCheckingSession(false);
        return;
      }
      try {
        const me = await apiCall(ENDPOINTS.me, 'GET', undefined, true);
        if (cancelled) return;
        await routeAfterAuth(me.role);
        // If routeAfterAuth didn't navigate (a role with no mobile
        // destination), fall through to the normal splash rather than
        // hanging on the spinner forever. Harmless no-op if it did
        // navigate — this component is about to unmount either way.
        if (!cancelled) setCheckingSession(false);
      } catch (err) {
        console.log('Session restore failed:', err);
        await clearTokens();
        if (!cancelled) setCheckingSession(false);
      }
    }

    checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!fontsLoaded || checkingSession) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Background ambulance image with opacity */}
      <Image
        source={require('../../assets/images/ambulance-intro.png')}
        style={styles.backgroundImage}
      />

      {/* Dark overlay */}
      <View style={styles.overlay} />

      {/* Logo at top section */}
      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/images/mera-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Middle section - lines and text */}
      <View style={styles.textContainer}>
        <View style={styles.line} />
        <Text style={styles.heading}>MERA</Text>
        <Text style={styles.subtitle}>Medical Emergency Response App</Text>
        <View style={styles.line} />
      </View>

      {/* Bottom button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.buttonText}>Login / Register</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  loadingContainer: {
    justifyContent: 'center',
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.15,
  },
  overlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: Colors.background,
    opacity: 0.6,
  },
  
  logo: {
    width: 600,
    height: 600,
  },
 logoContainer: {
    flex: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 0,
  },
textContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: -140,
  },

  line: {
    width: '90%',
    height: 3,
    backgroundColor: Colors.primary,
    marginVertical: 1,
  },
  heading: {
    fontFamily: 'LibreBaskerville_700Bold',
    fontSize: 94,
    color: Colors.textPrimary,
    letterSpacing: 4,
  },
  subtitle: {
    fontFamily: 'LibreBaskerville_700Bold',
    fontSize: 20,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  buttonContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: Colors.primary,
    width: 280,
    padding: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: 'LibreBaskerville_700Bold',
    color: Colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
});