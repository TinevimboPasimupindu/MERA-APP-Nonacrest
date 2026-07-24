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

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { Colors, Spacing } from '../../constants/theme';
import { apiCall, ENDPOINTS, saveToken } from '../../services/api';

export default function RegisterScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

    setLoading(true);

    console.log('Sending registration data:', JSON.stringify({
      full_name: fullName,
      email,
      phone_number: phone,
      password,
      confirm_password: confirmPassword,
      popi_consent: true,
      terms_consent: true,
    }));

    try {
      const data = await apiCall(ENDPOINTS.registerPatient, 'POST', {
        full_name: fullName,
        email,
        phone_number: phone,
        password,
        confirm_password: confirmPassword,
        popi_consent: true,
        terms_consent: true,
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
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
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

        {/* Next Button */}
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.nextButtonText}>Next →</Text>
          )}
        </TouchableOpacity>

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
  nextButton: {
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingVertical: 22,
    alignItems: 'center',
    marginTop: 40,
  },
  nextButtonText: {
    color: Colors.white,
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
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