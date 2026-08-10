import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts as useLibreFonts, LibreBaskerville_700Bold } from '@expo-google-fonts/libre-baskerville';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { useState } from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { apiCall, ENDPOINTS, saveToken } from '../../services/api';
import { routeAfterAuth } from '../../utils/route-after-auth';
import { useGoogleSignIn } from '../../hooks/use-google-signin';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // No consent flags passed — this screen has no checkbox to source them
  // from. A brand-new Google email tapped here comes back with
  // needs_registration (surfaced as google.error below) rather than the
  // account being silently created with no consent ever collected; see
  // accounts/views.py::GoogleSignInView and register.tsx's own Google
  // button, which does send real consent from its checkbox.
  const google = useGoogleSignIn();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  const [libreLoaded] = useLibreFonts({
    LibreBaskerville_700Bold,
  });

  if (!fontsLoaded || !libreLoaded) return null;

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await apiCall(ENDPOINTS.login, 'POST', { email, password });

      // Patients get an OTP-required response here instead of tokens —
      // see accounts/views.py::LoginView. Every other role's response is
      // unchanged (tokens directly), so this branch is the only new thing
      // in this handler; the else path below is exactly what this
      // function already did before the OTP step existed.
      if (data.otp_required) {
        router.replace({
          pathname: '/(auth)/verify-otp' as any,
          params: { userId: data.user_id, email },
        });
        return;
      }

      await saveToken(data.access, data.refresh);

      // Lands back in an in-progress emergency (active SOS / assigned
      // response) if the logging-in user has one, instead of always the
      // normal role dashboard — same decision app-launch session-restore
      // makes in (auth)/index.tsx, via the same shared helper.
      await routeAfterAuth(data.user.role);
    } catch (err: any) {
      setError(err.detail || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >

      {/* MERA Header with lines */}
      <View style={styles.headerContainer}>
        <View style={styles.line} />
        <Text style={styles.meraHeading}>MERA</Text>
        <Text style={styles.meraSubtitle}>Medical Emergency Response App</Text>
        <View style={styles.line} />
      </View>

      {/* Welcome Back */}
      <Text style={styles.welcomeHeading}>Welcome Back</Text>
      <Text style={styles.welcomeSubtitle}>Sign in to your account</Text>

      {/* Error Message */}
      {(error || google.error) ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || google.error}</Text>
        </View>
      ) : null}

      {/* Email Input */}
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
        />
      </View>

      {/* Password Input */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>PASSWORD</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Enter your password"
            placeholderTextColor={Colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Text style={styles.showHide}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Forgot Password */}
      <TouchableOpacity style={styles.forgotContainer}>
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      {/* Sign In Button */}
      <TouchableOpacity
        style={styles.signInButton}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.signInButtonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      {/* OR Divider */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Register Link */}
      <View style={styles.registerRow}>
        <Text style={styles.registerText}>Don't have an account? </Text>
<TouchableOpacity onPress={() => router.push('/(auth)/register' as any)}>
  <Text style={styles.registerLink}>Register here</Text>
        </TouchableOpacity>
      </View>

      {/* Apple Button */}
      <TouchableOpacity style={styles.appleButton}>
        <Ionicons
          name="logo-apple"
          size={28}
          color="white"
          style={{ marginRight: 20 }}
        />
        <Text style={styles.appleButtonText}>Continue with Apple</Text>
      </TouchableOpacity>

      {/* Google Button — hidden entirely when Google Sign-In isn't
          configured (missing EXPO_PUBLIC_GOOGLE_*_CLIENT_ID env vars),
          rather than rendered disabled. Google Sign-In is currently paused
          (see PROJECT_CONTEXT.md) and those vars can legitimately be
          absent in any given environment — the rest of this screen must
          keep working regardless. */}
      {google.isConfigured && (
        <TouchableOpacity
          style={[styles.googleButton, (google.loading || !google.canSignIn) && styles.googleButtonDisabled]}
          onPress={google.signIn}
          disabled={google.loading || !google.canSignIn}
        >
          {google.loading ? (
            <ActivityIndicator color="#4285F4" />
          ) : (
            <>
              <FontAwesome
                name="google"
                size={30}
                color="#4285F4"
                style={{ marginRight: 20 }}
              />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Secure Badge */}
      <View style={styles.secureBadge}>
        <Text style={styles.secureText}>🔒 Secure & HIPAA Compliant</Text>
      </View>

      {/* Terms & Conditions — accessible before logging in */}
      <TouchableOpacity onPress={() => router.push('/(auth)/terms-and-conditions' as any)}>
        <Text style={styles.termsLink}>Terms & Conditions</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
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
  meraSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  welcomeHeading: {
    fontFamily: 'LibreBaskerville_700Bold',
    fontSize: FontSizes.heading,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  welcomeSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
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
  inputContainer: {
    width: '100%',
    marginBottom: Spacing.md,
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingRight: Spacing.md,
  },
  passwordInput: {
    flex: 1,
    color: Colors.textPrimary,
    padding: Spacing.md,
    fontSize: FontSizes.md,
  },
  showHide: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
  },
  forgotContainer: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg,
  },
  forgotText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
  },
  signInButton: {
    backgroundColor: Colors.primary,
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  signInButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    fontFamily: 'LibreBaskerville_700Bold',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surface,
  },
  dividerText: {
    color: Colors.textSecondary,
    marginHorizontal: Spacing.sm,
    fontSize: FontSizes.sm,
  },
  registerRow: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
  },
  registerText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  registerLink: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  appleButton: {
    backgroundColor: '#000000',
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  appleButtonText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
  },
  googleButton: {
    backgroundColor: Colors.white,
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  googleButtonText: {
    color: '#000000',
    fontSize: FontSizes.md,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  secureBadge: {
    marginTop: Spacing.sm,
  },
  secureText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  termsLink: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    textDecorationLine: 'underline',
    marginTop: Spacing.md,
  },
});