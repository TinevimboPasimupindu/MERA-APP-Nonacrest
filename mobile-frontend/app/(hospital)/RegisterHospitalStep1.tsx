import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
} from 'react-native';
import { useRouter } from 'expo-router';

const theme = {
  colors: {
    bg:              '#0B0F1A',
    surface:         '#131929',
    surfaceBorder:   '#1E2A3A',
    surfaceFocus:    '#2A3A50',
    bannerBg:        '#0D2818',
    bannerBorder:    '#1A4D2E',
    progressActive:  '#4CAF50',
    progressInactive:'#1E2A3A',
    btnGreen:        '#4CAF50',
    btnGreenText:    '#000000',
    textPrimary:     '#E6EDF3',
    textSecondary:   '#8B949E',
    textPlaceholder: '#3D4F63',
    textLabel:       '#6B7A8D',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius:  { sm: 8, md: 10, lg: 14, full: 999 },
  font:    { xs: 11, sm: 13, base: 15, md: 17, lg: 20, xl: 22 },
};

const TOTAL_STEPS  = 3;
const CURRENT_STEP = 1;

const FormField: React.FC<{
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
}> = ({
  label, placeholder, value, onChangeText,
  keyboardType = 'default', autoCapitalize = 'words', secureTextEntry = false,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, focused && styles.inputFocused]}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textPlaceholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        underlineColorAndroid="transparent"
      />
    </View>
  );
};

export default function RegisterHospitalStep1() {
  const router = useRouter();

  const [facilityName, setFacilityName] = useState('');
  const [facilityType, setFacilityType] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [province, setProvince] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const isValid =
    facilityName.trim().length > 0 &&
    facilityType.trim().length > 0 &&
    registrationNumber.trim().length > 0 &&
    physicalAddress.trim().length > 0 &&
    province.trim().length > 0 &&
    email.trim().length > 0 &&
    password.trim().length > 0 &&
    confirmPassword.trim().length > 0;

  const handleNext = () => {
    if (!isValid) return;

    if (password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    router.push({
      pathname: '/(hospital)/RegisterHospitalStep2' as any,
      params: {
        facility_name: facilityName,
        facility_type: facilityType,
        registration_number: registrationNumber,
        physical_address: physicalAddress,
        province,
        email,
        password,
        confirm_password: confirmPassword,
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.bg} />

      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.screenTitle}>Register a Hospital</Text>
            <Text style={styles.stepSubtitle}>
              Step {CURRENT_STEP} of {TOTAL_STEPS}{'  ·  '}
              <Text style={styles.stepName}>Facility Information</Text>
            </Text>
          </View>
        </View>

        <View style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                i < CURRENT_STEP ? styles.progressSegmentActive : styles.progressSegmentInactive,
              ]}
            />
          ))}
        </View>

        <View style={styles.banner}>
          <View style={styles.bannerIconBox}>
            <Text style={styles.bannerIconText}>🏥</Text>
          </View>
          <Text style={styles.bannerText}>
            You are registering a healthcare facility on the MERA emergency response network.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.form}>

            <FormField
              label="EMAIL ADDRESS"
              placeholder="Official hospital email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <FormField
              label="CREATE PASSWORD"
              placeholder="Create a strong password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <FormField
              label="CONFIRM PASSWORD"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <FormField
              label="HOSPITAL / FACILITY NAME"
              placeholder="e.g. Netcare Milpark Hospital"
              value={facilityName}
              onChangeText={setFacilityName}
            />

            <FormField
              label="FACILITY TYPE"
              placeholder="Public / Private / Clinic / NGO"
              value={facilityType}
              onChangeText={setFacilityType}
            />

            <FormField
              label="REGISTRATION / LICENSE NUMBER"
              placeholder="Official health facility registration number"
              value={registrationNumber}
              onChangeText={setRegistrationNumber}
              autoCapitalize="characters"
            />

            <FormField
              label="PHYSICAL ADDRESS"
              placeholder="Street address, Suburb, City"
              value={physicalAddress}
              onChangeText={setPhysicalAddress}
            />

            <FormField
              label="PROVINCE"
              placeholder="e.g. Gauteng"
              value={province}
              onChangeText={setProvince}
            />

          </View>
          <View style={{ height: 40 }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextBtn, !isValid && styles.nextBtnDisabled]}
            onPress={handleNext}
            activeOpacity={0.85}
            disabled={!isValid}
          >
            <Text style={styles.nextBtnText}>Next  →</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/login' as any)}>
            <Text style={styles.signInLink}>
              Already registered?{'  '}
              <Text style={styles.signInArrow}>Sign in →</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  stickyHeader: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.md,
    zIndex: 10,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  backBtn: { padding: theme.spacing.xs, alignSelf: 'flex-start' },
  backArrow: { fontSize: theme.font.lg, color: theme.colors.textPrimary },
  titleBlock: { flex: 1, alignItems: 'center' },
  screenTitle: {
    fontSize: theme.font.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: 0.2,
  },
  stepSubtitle: {
    fontSize: theme.font.xs,
    color: theme.colors.textSecondary,
    marginTop: 3,
  },
  stepName: { color: theme.colors.textSecondary },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    height: 4,
  },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  progressSegmentActive: { backgroundColor: theme.colors.progressActive },
  progressSegmentInactive: { backgroundColor: theme.colors.progressInactive },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.bannerBg,
    borderWidth: 1,
    borderColor: theme.colors.bannerBorder,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  bannerIconBox: {
    width: 36, height: 36,
    borderRadius: theme.radius.sm,
    backgroundColor: '#1A4D2E',
    alignItems: 'center', justifyContent: 'center',
  },
  bannerIconText: { fontSize: 18 },
  bannerText: {
    flex: 1,
    fontSize: theme.font.sm,
    color: theme.colors.textSecondary,
    lineHeight: 19,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  form: { gap: theme.spacing.sm },
  fieldWrapper: { gap: 6 },
  fieldLabel: {
    fontSize: theme.font.xs,
    fontWeight: '700',
    color: theme.colors.textLabel,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 11,
    fontSize: theme.font.base,
    color: theme.colors.textPrimary,
  },
  inputFocused: { borderColor: theme.colors.surfaceFocus },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: Platform.OS === 'ios' ? theme.spacing.lg : theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.bg,
  },
  nextBtn: {
    backgroundColor: theme.colors.btnGreen,
    borderRadius: theme.radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnDisabled: { opacity: 0.45 },
  nextBtnText: {
    fontSize: theme.font.base,
    fontWeight: '700',
    color: theme.colors.btnGreenText,
    letterSpacing: 0.3,
  },
  signInLink: {
    textAlign: 'center',
    fontSize: theme.font.sm,
    color: theme.colors.textSecondary,
  },
  signInArrow: { color: theme.colors.textSecondary, fontWeight: '600' },
});