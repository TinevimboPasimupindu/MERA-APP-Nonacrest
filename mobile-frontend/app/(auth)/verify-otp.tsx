import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts as useLibreFonts, LibreBaskerville_700Bold } from '@expo-google-fonts/libre-baskerville';

import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS, saveToken } from '../../services/api';
import { routeAfterAuth } from '../../utils/route-after-auth';

// Shown after login.tsx's password step succeeds but the backend responds
// with otp_required instead of tokens (patients only — see
// accounts/views.py::LoginView). Reached via router.replace so the back
// button can't return to the password screen and re-trigger login with
// stale state; the user_id param is the same opaque id LoginView's
// {otp_required, user_id} response carried.
export default function VerifyOtpScreen() {
  const { userId, email } = useLocalSearchParams<{ userId: string; email?: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [resendMessage, setResendMessage] = useState('');

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });
  const [libreLoaded] = useLibreFonts({
    LibreBaskerville_700Bold,
  });

  if (!fontsLoaded || !libreLoaded) return null;

  const handleVerify = async () => {
    setError('');
    setResendMessage('');

    if (code.length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    try {
      const data = await apiCall(ENDPOINTS.verifyOtp, 'POST', {
        user_id: userId,
        code,
      });
      await saveToken(data.access, data.refresh);
      // Same routing decision normal login always made — an OTP step in
      // between doesn't change where a patient lands afterward.
      await routeAfterAuth(data.user.role);
    } catch (err: any) {
      setError(err.detail || 'Invalid or expired code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setResendMessage('');
    setResending(true);
    try {
      await apiCall(ENDPOINTS.resendOtp, 'POST', { user_id: userId });
      setCode('');
      setResendMessage('A new code has been sent to your email.');
    } catch (err: any) {
      // e.g. 429 from the generation rate limit — surfaced as-is rather
      // than a generic message, since "wait a few minutes" is genuinely
      // actionable information here.
      setError(err.detail || 'Could not resend the code. Please try again shortly.');
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <View style={styles.line} />
          <Text style={styles.meraHeading}>MERA</Text>
          <View style={styles.line} />
        </View>

        <Text style={styles.welcomeHeading}>Check Your Email</Text>
        <Text style={styles.welcomeSubtitle}>
          {email
            ? `We sent a 6-digit verification code to ${email}.`
            : 'We sent a 6-digit verification code to your email.'}
        </Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {resendMessage ? (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>{resendMessage}</Text>
          </View>
        ) : null}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>VERIFICATION CODE</Text>
          <TextInput
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor={Colors.textSecondary}
            value={code}
            onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textAlign="center"
          />
        </View>

        <TouchableOpacity
          style={[styles.verifyButton, (loading || code.length !== 6) && styles.verifyButtonDisabled]}
          onPress={handleVerify}
          disabled={loading || code.length !== 6}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.verifyButtonText}>Verify</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.resendRow}>
          <Text style={styles.resendText}>
            {resending ? 'Sending…' : "Didn't get a code? "}
            {!resending && <Text style={styles.resendLink}>Resend</Text>}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
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
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  successText: {
    color: Colors.success,
    fontSize: FontSizes.sm,
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
  codeInput: {
    backgroundColor: Colors.surface,
    color: Colors.textPrimary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 28,
    letterSpacing: 12,
    fontFamily: 'Inter_700Bold',
  },
  verifyButton: {
    backgroundColor: Colors.primary,
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  verifyButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    fontFamily: 'LibreBaskerville_700Bold',
  },
  resendRow: {
    alignItems: 'center',
  },
  resendText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  resendLink: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
});
