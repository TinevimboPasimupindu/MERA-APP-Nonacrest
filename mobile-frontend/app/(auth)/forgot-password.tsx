import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts as useLibreFonts, LibreBaskerville_700Bold } from '@expo-google-fonts/libre-baskerville';

import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

// Self-service password reset — reached from login.tsx's "Forgot password?"
// link. Posts to the same POST /auth/password-reset/ the web login page's
// ForgotPasswordModal uses (accounts/views.py::PasswordResetRequestView,
// role-agnostic — patients and EMTs are handled identically). The emailed
// link points at the *web* reset page (WEB_FRONTEND_URL/reset-password),
// not back into this app: the user finishes the reset in their phone's
// browser, then returns here to sign in with the new password. There is
// deliberately no reset-confirmation screen in the mobile app.
//
// Anti-enumeration, matching the web version exactly: once the request has
// been submitted, the same generic message is shown no matter what happened
// — the backend returns the identical 200 whether the account exists,
// doesn't, the send failed, or the address hit its hourly generation cap,
// so anything more specific shown here (e.g. surfacing a caught network or
// 429 error differently) would either be wrong or reintroduce client-side
// a distinction the backend deliberately hides. The one check done *before*
// the request is a plain format check (see isPlausibleEmail) — that says
// nothing about whether an account exists, it just stops an obviously
// malformed address from being reported as "sent", the same job the web
// form's native type="email" validation does.
const GENERIC_MESSAGE =
  'A password reset link has been sent. Open it on this phone, set a new password, then come back here to sign in.';

function isPlausibleEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });
  const [libreLoaded] = useLibreFonts({
    LibreBaskerville_700Bold,
  });

  if (!fontsLoaded || !libreLoaded) return null;

  const handleSubmit = async () => {
    setError('');
    const trimmed = email.trim();

    if (!isPlausibleEmail(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await apiCall(ENDPOINTS.passwordReset, 'POST', { email: trimmed });
    } catch {
      // Deliberately ignored — see the anti-enumeration note at the top of
      // this file. A caught error here has nothing more specific to say
      // than the generic message shown either way.
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <View style={styles.headerContainer}>
            <View style={styles.line} />
            <Text style={styles.meraHeading}>MERA</Text>
            <View style={styles.line} />
          </View>

          <Text style={styles.welcomeHeading}>Reset Password</Text>

          {submitted ? (
            <>
              <View style={styles.successContainer}>
                <Text style={styles.successText}>{GENERIC_MESSAGE}</Text>
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.replace('/(auth)/login' as any)}
              >
                <Text style={styles.primaryButtonText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.welcomeSubtitle}>
                Enter the email for your account and we'll send you a link to reset your password.
              </Text>

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.inputContainer}>
                <Text style={styles.label}>EMAIL ADDRESS</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email"
                  placeholderTextColor={Colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
                <Text style={styles.backText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  headerContainer: {
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.xl,
  },
  line: {
    width: '65%',
    height: 5,
    backgroundColor: Colors.primary,
    marginVertical: 10,
    borderRadius: 10,
  },
  meraHeading: {
    fontFamily: 'LibreBaskerville_700Bold',
    fontSize: 42,
    color: Colors.textPrimary,
    letterSpacing: 4,
  },
  welcomeHeading: {
    fontFamily: 'LibreBaskerville_700Bold',
    fontSize: FontSizes.heading,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  errorContainer: {
    width: '100%',
    backgroundColor: '#3D0000',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.emergency,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: FontSizes.sm,
  },
  successContainer: {
    width: '100%',
    backgroundColor: '#0A2010',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  successText: {
    color: Colors.success,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  inputContainer: {
    width: '100%',
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: FontSizes.md,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    fontFamily: 'LibreBaskerville_700Bold',
  },
  backRow: {
    alignItems: 'center',
  },
  backText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
});
