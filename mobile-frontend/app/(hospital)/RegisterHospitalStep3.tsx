import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { apiCall, ENDPOINTS } from '../../services/api';

type DocKey = 'healthCert' | 'cipcDoc' | 'letterOfAuth';

interface DocsState {
  healthCert: boolean;
  cipcDoc: boolean;
  letterOfAuth: boolean;
}

const theme = {
  colors: {
    bg: '#0B0F1A',
    surface: '#131929',
    surfaceBorder: '#1E2A3A',
    summaryBg: '#0E1E12',
    summaryBorder: '#1A4D2E',
    summaryLabel: '#6B7A8D',
    summaryValue: '#C9D1D9',
    summaryTitle: '#E6EDF3',
    summarySubtitle: '#8B949E',
    summaryDot: '#3D4F63',
    progressActive: '#4CAF50',
    progressInactive: '#1E2A3A',
    docUploaded: '#4CAF50',
    docUpload: '#4CAF50',
    docText: '#C9D1D9',
    docOptional: '#6B7A8D',
    checkboxBg: '#0D2818',
    checkboxTick: '#4CAF50',
    checkboxText: '#8B949E',
    btnGreen: '#4CAF50',
    btnGreenText: '#000000',
    btnBack: '#131929',
    btnBackBorder: '#1E2A3A',
    btnBackText: '#8B949E',
    textPrimary: '#E6EDF3',
    textSecondary: '#8B949E',
    textLabel: '#6B7A8D',
    textNote: '#6B7A8D',
    sectionLabel: '#6B7A8D',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 10, lg: 14, full: 999 },
  font: { xs: 11, sm: 13, base: 15, md: 17, lg: 20 },
};

const TOTAL_STEPS = 3;
const CURRENT_STEP = 3;

const StepProgressBar: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <View style={styles.progressRow}>
    {Array.from({ length: total }).map((_, i) => (
      <View
        key={i}
        style={[
          styles.progressSegment,
          i < current ? styles.progressSegmentActive : styles.progressSegmentInactive,
        ]}
      />
    ))}
  </View>
);

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={styles.summaryValue}>{value}</Text>
  </View>
);

const DocumentRow: React.FC<{
  label: string;
  uploaded: boolean;
  optional?: boolean;
  onUpload: () => void;
}> = ({ label, uploaded, optional = false, onUpload }) => (
  <View style={[styles.docRow, optional && !uploaded && styles.docRowOptional]}>
    <Text style={[styles.docLabel, optional && !uploaded && styles.docLabelOptional]}>
      {label}
    </Text>
    {uploaded ? (
      <Text style={styles.docUploaded}>Uploaded ✓</Text>
    ) : (
      <TouchableOpacity onPress={onUpload} activeOpacity={0.7}>
        <Text style={styles.docUploadBtn}>Upload →</Text>
      </TouchableOpacity>
    )}
  </View>
);

const Checkbox: React.FC<{ checked: boolean; onToggle: () => void; label: string }> = ({ checked, onToggle, label }) => (
  <TouchableOpacity style={styles.checkboxRow} onPress={onToggle} activeOpacity={0.8}>
    <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
      {checked && <Text style={styles.checkboxTick}>✓</Text>}
    </View>
    <Text style={styles.checkboxLabel}>{label}</Text>
  </TouchableOpacity>
);

export default function RegisterHospitalStep3(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [docs, setDocs] = useState<DocsState>({
    healthCert: false,
    cipcDoc: false,
    letterOfAuth: false,
  });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = docs.healthCert && docs.cipcDoc && agreed;

  const handleUpload = async (docKey: DocKey): Promise<void> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file) return;
      setDocs(prev => ({ ...prev, [docKey]: true }));
      Alert.alert('Document Uploaded', `${file.name} uploaded successfully.`);
    } catch (err) {
      Alert.alert('Upload failed', 'Could not open document picker.');
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await apiCall(ENDPOINTS.registerHospital, 'POST', {
        facility_name: params.facility_name,
        facility_type: params.facility_type?.toString().toLowerCase(),
        facility_registration_number: params.registration_number,
        official_address: params.physical_address,
        province: params.province,
        email: params.email,
        admin_contact_name: params.admin_name,
        admin_phone: params.ed_phone,
        phone_number: params.main_phone,
        password: params.password,
        confirm_password: params.confirm_password,
        terms_consent: true,
      });

      Alert.alert(
        'Registration Submitted!',
        'Your hospital registration has been submitted. The MERA team will review and activate your account within 2 business days.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login' as any) }]
      );
    } catch (err: any) {
      console.log('Hospital registration error:', JSON.stringify(err));
      Alert.alert(
        'Registration Failed',
        err.detail || JSON.stringify(err) || 'Could not submit registration. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
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
              <Text style={styles.stepName}>Verify & Submit</Text>
            </Text>
          </View>
        </View>

        <StepProgressBar current={CURRENT_STEP} total={TOTAL_STEPS} />

        <Text style={styles.reviewTitle}>Review your submission</Text>
        <Text style={styles.reviewSubtitle}>
          MERA will verify your facility before granting access.
        </Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <Text style={styles.summaryFacilityIcon}>🏥</Text>
              <View>
                <Text style={styles.summaryFacilityName}>
                  {params.facility_name || 'Your Hospital'}
                </Text>
                <View style={styles.summarySubRow}>
                  <Text style={styles.summarySubtitle}>{params.facility_type}</Text>
                  <View style={styles.summaryDot} />
                  <Text style={styles.summarySubtitle}>{params.province}</Text>
                </View>
              </View>
            </View>

            <View style={styles.summaryDivider} />

            <SummaryRow label="License No." value={params.registration_number as string || '—'} />
            <SummaryRow label="Admin" value={`${params.admin_name}  •  ${params.admin_title}`} />
            <SummaryRow label="Email" value={params.email as string || '—'} />
            <SummaryRow label="Phone" value={params.main_phone as string || '—'} />
            <SummaryRow label="ED Line" value={params.ed_phone as string || '—'} />
            <SummaryRow label="Departments" value={params.departments as string || '—'} />
          </View>

          {/* Documents */}
          <Text style={styles.sectionLabel}>SUPPORTING DOCUMENTS</Text>
          <View style={styles.docsCard}>
            <DocumentRow
              label="Health Facility Certificate"
              uploaded={docs.healthCert}
              onUpload={() => handleUpload('healthCert')}
            />
            <View style={styles.docDivider} />
            <DocumentRow
              label="CIPC Registration Document"
              uploaded={docs.cipcDoc}
              onUpload={() => handleUpload('cipcDoc')}
            />
            <View style={styles.docDivider} />
            <DocumentRow
              label="Letter of Authority (optional)"
              uploaded={docs.letterOfAuth}
              optional
              onUpload={() => handleUpload('letterOfAuth')}
            />
          </View>

          {/* Terms */}
          <Checkbox
            checked={agreed}
            onToggle={() => setAgreed(v => !v)}
            label="I confirm this is an authorised healthcare facility and agree to MERA's terms of use."
          />

          <Text style={styles.reviewNote}>
            After submitting, the MERA team will review and activate your hospital account within 2 business days.
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Fixed Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={!canSubmit || loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.btnGreenText} />
            ) : (
              <Text style={styles.submitBtnText}>Submit Hospital Registration</Text>
            )}
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
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
    marginBottom: theme.spacing.lg,
    height: 4,
  },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  progressSegmentActive: { backgroundColor: theme.colors.progressActive },
  progressSegmentInactive: { backgroundColor: theme.colors.progressInactive },
  reviewTitle: {
    fontSize: theme.font.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  reviewSubtitle: {
    fontSize: theme.font.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: 19,
  },
  summaryCard: {
    backgroundColor: theme.colors.summaryBg,
    borderWidth: 1,
    borderColor: theme.colors.summaryBorder,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  summaryFacilityIcon: { fontSize: 22, marginTop: 1 },
  summaryFacilityName: {
    fontSize: theme.font.base,
    fontWeight: '700',
    color: theme.colors.summaryTitle,
  },
  summarySubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  summarySubtitle: { fontSize: theme.font.xs, color: theme.colors.summarySubtitle },
  summaryDot: {
    width: 3, height: 3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.summaryDot,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: theme.colors.summaryBorder,
    marginVertical: theme.spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: theme.spacing.sm,
  },
  summaryLabel: { fontSize: theme.font.xs, color: theme.colors.summaryLabel, minWidth: 72 },
  summaryValue: { fontSize: theme.font.xs, color: theme.colors.summaryValue, flex: 1, textAlign: 'right' },
  sectionLabel: {
    fontSize: theme.font.xs,
    fontWeight: '700',
    color: theme.colors.sectionLabel,
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  docsCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.surfaceBorder,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  docRowOptional: { opacity: 0.6 },
  docLabel: { fontSize: theme.font.sm, fontWeight: '500', color: theme.colors.docText, flex: 1 },
  docLabelOptional: { color: theme.colors.docOptional },
  docUploaded: { fontSize: theme.font.sm, fontWeight: '700', color: theme.colors.docUploaded },
  docUploadBtn: { fontSize: theme.font.sm, fontWeight: '700', color: theme.colors.docUpload },
  docDivider: { height: 1, backgroundColor: theme.colors.surfaceBorder, marginHorizontal: theme.spacing.md },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.checkboxBg,
    borderWidth: 1,
    borderColor: theme.colors.summaryBorder,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  checkboxBox: {
    width: 22, height: 22,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    borderColor: theme.colors.summaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxBoxChecked: { backgroundColor: theme.colors.checkboxTick, borderColor: theme.colors.checkboxTick },
  checkboxTick: { fontSize: 13, fontWeight: '700', color: '#000' },
  checkboxLabel: { flex: 1, fontSize: theme.font.sm, color: theme.colors.checkboxText, lineHeight: 19 },
  reviewNote: { fontSize: theme.font.sm, color: theme.colors.textNote, lineHeight: 19 },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: Platform.OS === 'ios' ? theme.spacing.lg : theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.bg,
  },
  submitBtn: {
    backgroundColor: theme.colors.btnGreen,
    borderRadius: theme.radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: {
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
  backEditBtnText: { fontSize: theme.font.base, fontWeight: '600', color: theme.colors.btnBackText },
});