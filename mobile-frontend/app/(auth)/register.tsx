import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { useState } from 'react';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { Colors, Spacing } from '../../constants/theme';
import { apiCall, ENDPOINTS, saveToken } from '../../services/api';
import { useGoogleSignIn } from '../../hooks/use-google-signin';

export default function RegisterScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Sends real consent from this screen's own checkbox — unlike
  // login.tsx's Google button (which has no checkbox and sends none at
  // all), so a new account created from here has genuinely been agreed to
  // by the same checkbox the email/password path already requires.
  const google = useGoogleSignIn({ popi_consent: agreedToTerms, terms_consent: agreedToTerms });

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  if (!fontsLoaded) return null;

  const handleRegister = async () => {
    setError('');

    if (!fullName || !email || !phone || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Belt-and-suspenders alongside the Register button's disabled state
    // below — the button already prevents reaching this point unchecked,
    // but this guard means that stays true even if the button's guard
    // ever changes.
    if (!agreedToTerms) {
      setError('You must agree to the Terms & Conditions to register.');
      return;
    }

    setLoading(true);

    // popi_consent and terms_consent are two distinct fields the backend
    // validates independently (PatientRegistrationSerializer.validate())
    // — not the same consent. Both are set from this one checkbox
    // deliberately: terms-and-conditions.tsx is a single combined
    // document covering general terms AND POPIA/data-handling matters
    // together (see PROJECT_CONTEXT.md), so agreeing to it genuinely
    // covers both backend consent records, not just one of them.
    console.log('Sending registration data:', JSON.stringify({
      full_name: fullName,
      email,
      phone_number: phone,
      password,
      confirm_password: confirmPassword,
      popi_consent: agreedToTerms,
      terms_consent: agreedToTerms,
    }));

    try {
      const data = await apiCall(ENDPOINTS.registerPatient, 'POST', {
        full_name: fullName,
        email,
        phone_number: phone,
        password,
        confirm_password: confirmPassword,
        popi_consent: agreedToTerms,
        terms_consent: agreedToTerms,
      });

      await saveToken(data.access, data.refresh);
      router.replace('/(patient)/medical-intake' as any);

    } catch (err: any) {
      console.log('Registration error:', JSON.stringify(err));
      setError(JSON.stringify(err) || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>

      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <Text style={styles.heading}>Create Account</Text>
        <Text style={styles.subHeading}>• Personal Info</Text>
        <View style={styles.progressBackground}>
          <View style={styles.progressFill} />
        </View>
      </View>

      {/* Scrollable Form */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >

        {/* Error Message */}
        {(error || google.error) ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error || google.error}</Text>
          </View>
        ) : null}

        {/* Full Name */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>FULL NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor={Colors.textSecondary}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        {/* Email */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email address"
            placeholderTextColor={Colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Phone */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>PHONE NUMBER</Text>
          <TextInput
            style={styles.input}
            placeholder="+27 Enter phone number"
            placeholderTextColor={Colors.textSecondary}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        {/* ID */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>IDENTIFICATION NUMBER</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter ID or Passport Number"
            placeholderTextColor={Colors.textSecondary}
            value={idNumber}
            onChangeText={setIdNumber}
          />
        </View>

        {/* Password */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="Create a strong password"
            placeholderTextColor={Colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {/* Confirm Password */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>CONFIRM PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="Repeat your password"
            placeholderTextColor={Colors.textSecondary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        {/* Terms & Conditions consent — required, genuinely user-driven.
            The checkbox and the "Terms & Conditions" link are separate tap
            targets on purpose: tapping the link should only open the
            document, never silently toggle consent as a side effect. */}
        <View style={styles.consentRow}>
          <TouchableOpacity
            style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}
            onPress={() => setAgreedToTerms((prev) => !prev)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreedToTerms }}
          >
            {agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.consentTextWrap}
            onPress={() => setAgreedToTerms((prev) => !prev)}
            activeOpacity={0.7}
          >
            <Text style={styles.consentText}>
              I agree to the{' '}
              <Text
                style={styles.consentLink}
                onPress={() => router.push('/(auth)/terms-and-conditions' as any)}
              >
                Terms & Conditions
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.nextButton, !agreedToTerms && styles.nextButtonDisabled]}
          onPress={handleRegister}
          disabled={loading || !agreedToTerms}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.nextButtonText}>Next →</Text>
          )}
        </TouchableOpacity>

        {/* OR Divider + Google Button — both hidden together when Google
            Sign-In isn't configured (missing EXPO_PUBLIC_GOOGLE_*_CLIENT_ID
            env vars), rather than rendering an orphaned "OR" divider with
            nothing beneath it. Google Sign-In is currently paused (see
            PROJECT_CONTEXT.md) and those vars can legitimately be absent
            in any given environment — the rest of this screen (the actual
            registration form) must keep working regardless. */}
        {google.isConfigured && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Button — same consent checkbox gates this as the
                Next button above, for the same reason: a new account
                created via Google still needs real, user-driven consent,
                not a side-effect of tapping a button that happens to also
                send popi_consent/terms_consent behind the scenes. */}
            <TouchableOpacity
              style={[
                styles.googleButton,
                (!agreedToTerms || google.loading || !google.canSignIn) && styles.googleButtonDisabled,
              ]}
              onPress={google.signIn}
              disabled={!agreedToTerms || google.loading || !google.canSignIn}
            >
              {google.loading ? (
                <ActivityIndicator color="#4285F4" />
              ) : (
                <>
                  <FontAwesome name="google" size={24} color="#4285F4" style={{ marginRight: 16 }} />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Sign In Link */}
        <View style={styles.signInRow}>
          <Text style={styles.signInText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login' as any)}>
            <Text style={styles.signInLink}> Sign in</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  stickyHeader: {
    backgroundColor: Colors.background,
    paddingTop: 90,
    paddingHorizontal: Spacing.lg,
    zIndex: 10,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 80,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 42,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subHeading: {
    fontFamily: 'Inter_400Regular',
    fontSize: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  progressBackground: {
    width: '100%',
    height: 8,
    backgroundColor: '#1B1D35',
    borderRadius: 999,
    marginBottom: 10,
  },
  progressFill: {
    width: '50%',
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  errorContainer: {
    width: '100%',
    backgroundColor: '#3D0000',
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: Colors.emergency,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  inputContainer: {
    marginBottom: 22,
  },
  label: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    letterSpacing: 2,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#2A2D45',
    borderWidth: 1,
    borderColor: '#3B3E5B',
    borderRadius: 22,
    padding: 20,
    fontSize: 18,
    color: Colors.textPrimary,
    fontFamily: 'Inter_400Regular',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 30,
    gap: 12,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#3B3E5B',
    backgroundColor: '#2A2D45',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    lineHeight: 18,
  },
  consentTextWrap: {
    flex: 1,
  },
  consentText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  consentLink: {
    color: Colors.primary,
    fontFamily: 'Inter_700Bold',
    textDecorationLine: 'underline',
  },
  nextButton: {
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 22,
    alignItems: 'center',
    marginTop: 24,
  },
  nextButtonDisabled: {
    backgroundColor: '#2A2D45',
  },
  nextButtonText: {
    color: Colors.white,
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A2D45',
  },
  dividerText: {
    color: Colors.textSecondary,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    marginHorizontal: 12,
  },
  googleButton: {
    backgroundColor: Colors.white,
    width: '100%',
    padding: 18,
    borderRadius: 22,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 35,
  },
  signInText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  signInLink: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
});