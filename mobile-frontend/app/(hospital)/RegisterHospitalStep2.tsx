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
  Alert,
  Keyboard,
  KeyboardTypeOptions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

const theme = {
  colors: {
    bg: '#0B0F1A',
    surface: '#131929',
    surfaceBorder: '#1E2A3A',
    surfaceFocus: '#2A3A50',
    progressActive: '#4CAF50',
    progressInactive: '#1E2A3A',
    btnGreen: '#4CAF50',
    btnGreenText: '#000000',
    btnBack: '#131929',
    btnBackBorder: '#1E2A3A',
    btnBackText: '#8B949E',
    tagActiveBg: '#1A3A1A',
    tagActiveBorder: '#4CAF50',
    tagActiveText: '#4CAF50',
    tagAddBorder: '#2A3A50',
    tagAddText: '#8B949E',
    textPrimary: '#E6EDF3',
    textSecondary: '#8B949E',
    textPlaceholder: '#3D4F63',
    textLabel: '#6B7A8D',
    textQuestion: '#C9D1D9',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 10, lg: 14, full: 999 },
  font: { xs: 11, sm: 13, base: 15, md: 17, lg: 20 },
};

const TOTAL_STEPS = 3;
const CURRENT_STEP = 2;

const FormField: React.FC<{
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}> = ({ label, placeholder, value, onChangeText, keyboardType = 'default', autoCapitalize = 'words' }) => {
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
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        underlineColorAndroid="transparent"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
};

const DepartmentTag: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <TouchableOpacity style={styles.tagActive} onPress={onRemove} activeOpacity={0.7}>
    <Text style={styles.tagActiveText}>{label}</Text>
    <Text style={styles.tagRemove}> ×</Text>
  </TouchableOpacity>
);

export default function RegisterHospitalStep2(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [adminFullName, setAdminFullName] = useState('');
  const [adminJobTitle, setAdminJobTitle] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emergencyLine, setEmergencyLine] = useState('');
  const [departments, setDepartments] = useState<string[]>(['Emergency', 'Cardiology']);

  const handleAddDepartment = () => {
    Keyboard.dismiss();
    if (Platform.OS === 'ios') {
      Alert.prompt('Add Department', 'Enter a department or specialisation:', text => {
        if (text?.trim()) setDepartments(prev => [...prev, text.trim()]);
      }, 'plain-text');
    } else {
      Alert.alert('Add Department', 'Type a department name:', [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Add',
          onPress: () => {
            // On Android we just add a placeholder — user can edit later
            setDepartments(prev => [...prev, 'New Department']);
          },
        },
      ]);
    }
  };

  const handleRemoveDepartment = (index: number) => {
    setDepartments(prev => prev.filter((_, i) => i !== index));
  };

  const isValid =
    adminFullName.trim().length > 0 &&
    adminJobTitle.trim().length > 0 &&
    phoneNumber.trim().length > 0 &&
    emergencyLine.trim().length > 0 &&
    departments.length > 0;

  const handleNext = () => {
    if (!isValid) return;
    router.push({
      pathname: '/(hospital)/RegisterHospitalStep3' as any,
      params: {
        // Pass through from step 1
        facility_name: params.facility_name,
        facility_type: params.facility_type,
        registration_number: params.registration_number,
        physical_address: params.physical_address,
        province: params.province,
        email: params.email,
        password: params.password,
        confirm_password: params.confirm_password,
        // From step 2
        admin_name: adminFullName,
        admin_title: adminJobTitle,
        main_phone: phoneNumber,
        ed_phone: emergencyLine,
        departments: departments.join(','),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.bg} />

      <View style={styles.stickyHeader}>
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.screenTitle}>Register a Hospital</Text>
            <Text style={styles.stepSubtitle}>
              Step {CURRENT_STEP} of {TOTAL_STEPS}{'  ·  '}
              <Text style={styles.stepName}>Contact & Administrator</Text>
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

        <Text style={styles.sectionQuestion}>
          Who will manage this hospital's MERA portal?
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.form}>

            <FormField
              label="ADMINISTRATOR FULL NAME"
              placeholder="Name of the person managing this account"
              value={adminFullName}
              onChangeText={setAdminFullName}
            />

            <FormField
              label="ADMINISTRATOR JOB TITLE"
              placeholder="e.g. Hospital Manager, IT Administrator"
              value={adminJobTitle}
              onChangeText={setAdminJobTitle}
            />

            <FormField
              label="HOSPITAL PHONE NUMBER"
              placeholder="Main reception / emergency line"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />

            <FormField
              label="EMERGENCY DEPARTMENT DIRECT LINE"
              placeholder="Direct ED contact number"
              value={emergencyLine}
              onChangeText={setEmergencyLine}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />

            {/* Departments */}
            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>DEPARTMENTS / SPECIALISATIONS</Text>
              <View style={styles.tagInputBox}>
                <View style={styles.tagRow}>
                  {departments.map((dept, i) => (
                    <DepartmentTag key={i} label={dept} onRemove={() => handleRemoveDepartment(i)} />
                  ))}
                  <TouchableOpacity style={styles.tagAdd} onPress={handleAddDepartment} activeOpacity={0.7}>
                    <Text style={styles.tagAddText}>+ Add</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

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

          <TouchableOpacity style={styles.backEditBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backEditBtnText}>Go Back & Edit</Text>
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
  sectionQuestion: {
    fontSize: theme.font.sm,
    color: theme.colors.textQuestion,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    fontWeight: '500',
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
  tagInputBox: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    minHeight: 52,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  tagActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.tagActiveBg,
    borderWidth: 1,
    borderColor: theme.colors.tagActiveBorder,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  tagActiveText: {
    fontSize: theme.font.sm,
    fontWeight: '600',
    color: theme.colors.tagActiveText,
  },
  tagRemove: { fontSize: theme.font.sm, color: theme.colors.tagActiveText, fontWeight: '700' },
  tagAdd: {
    borderWidth: 1,
    borderColor: theme.colors.tagAddBorder,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  tagAddText: { fontSize: theme.font.sm, color: theme.colors.tagAddText, fontWeight: '600' },
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
  backEditBtn: {
    backgroundColor: theme.colors.btnBack,
    borderWidth: 1,
    borderColor: theme.colors.btnBackBorder,
    borderRadius: theme.radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  backEditBtnText: {
    fontSize: theme.font.base,
    fontWeight: '600',
    color: theme.colors.btnBackText,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
});