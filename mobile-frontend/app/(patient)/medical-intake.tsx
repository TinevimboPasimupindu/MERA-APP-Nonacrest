import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function MedicalIntakeScreen() {
  const [bloodType, setBloodType] = useState('');
  const [conditions, setConditions] = useState('');
  const [medications, setMedications] = useState('');
  const [allergies, setAllergies] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);

  const canProceed =
    bloodType !== '' &&
    conditions !== '' &&
    medications !== '' &&
    allergies !== '' &&
    consent;

  const handleNext = async () => {
    if (!canProceed) return;
    setLoading(true);
    try {
      await apiCall(ENDPOINTS.medicalProfileSubmit, 'PATCH', {
        blood_type: bloodType,
        chronic_conditions: conditions,
        current_medications: medications,
        known_allergies: allergies,
        paramedic_notes: notes,
        data_sharing_consent: consent,
      }, true);

      router.push('/(patient)/hospital-selection' as any);

    } catch (err: any) {
      console.log('Medical intake error:', JSON.stringify(err));
      Alert.alert(
        'Submission Failed',
        err.detail || 'Could not save your medical profile. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >

        {/* FIXED HEADER */}
        <View style={styles.fixedTop}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Medical Intake</Text>
              <Text style={styles.headerSub}>Step 1 of 3 • Health Information</Text>
            </View>
          </View>

          <View style={styles.progressRow}>
            {[1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.progressSeg, i === 1 && styles.progressActive]}
              />
            ))}
          </View>
        </View>

        {/* SCROLLABLE CONTENT */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >

          {/* Banner */}
          <View style={styles.banner}>
            <Text style={styles.bannerIcon}>ℹ️</Text>
            <Text style={styles.bannerText}>
              Your info will be verified by a hospital before you can use emergency features.
            </Text>
          </View>

          {/* Blood type */}
          <Text style={styles.fieldLabel}>BLOOD TYPE</Text>
          <View style={styles.chipRow}>
            {BLOOD_TYPES.map((bt) => (
              <TouchableOpacity
                key={bt}
                style={[styles.chip, bloodType === bt && styles.chipSelected]}
                onPress={() => setBloodType(bt)}
              >
                <Text style={[styles.chipText, bloodType === bt && styles.chipTextSelected]}>
                  {bt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Conditions */}
          <Text style={styles.fieldLabel}>MEDICAL CONDITIONS</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Diabetes, Hypertension, Asthma..."
            placeholderTextColor={Colors.textSecondary}
            value={conditions}
            onChangeText={setConditions}
            multiline
            textAlignVertical="top"
            returnKeyType="done"
            blurOnSubmit
          />

          {/* Medications */}
          <Text style={styles.fieldLabel}>CURRENT MEDICATIONS</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Metformin 500mg, Lisinopril 10mg..."
            placeholderTextColor={Colors.textSecondary}
            value={medications}
            onChangeText={setMedications}
            multiline
            textAlignVertical="top"
            returnKeyType="done"
            blurOnSubmit
          />

          {/* Allergies */}
          <Text style={styles.fieldLabel}>KNOWN ALLERGIES</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Penicillin, Shellfish, Latex..."
            placeholderTextColor={Colors.textSecondary}
            value={allergies}
            onChangeText={setAllergies}
            multiline
            textAlignVertical="top"
            returnKeyType="done"
            blurOnSubmit
          />

          {/* Notes */}
          <Text style={styles.fieldLabel}>ADDITIONAL NOTES (optional)</Text>
          <TextInput
            style={[styles.input, styles.inputTall]}
            placeholder="Any other info your hospital should know..."
            placeholderTextColor={Colors.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
            returnKeyType="done"
            blurOnSubmit
          />

          {/* Consent */}
          <TouchableOpacity
            style={styles.consentRow}
            onPress={() => setConsent(!consent)}
          >
            <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
              {consent && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.consentText}>
              I consent to share this information with hospitals and ambulances via MERA.
            </Text>
          </TouchableOpacity>

          {/* Next button */}
          <TouchableOpacity
            style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed || loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.nextBtnText}>Next →</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fixedTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 130,
    paddingHorizontal: Spacing.md,
    paddingBottom: 180,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    padding: Spacing.sm,
  },
  backText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xl,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  headerSub: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  progressSeg: {
    flex: 1,
    height: 4,
    backgroundColor: '#1E2040',
    borderRadius: 2,
  },
  progressActive: {
    backgroundColor: Colors.primary,
  },
  banner: {
    flexDirection: 'row',
    backgroundColor: '#0D1B3E',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  bannerIcon: {
    fontSize: 16,
  },
  bannerText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 18,
  },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#1A1B2E',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#2A2B40',
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  chipTextSelected: {
    color: Colors.white,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0D0E1A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    minHeight: 58,
  },
  inputTall: {
    minHeight: 100,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0D1B3E',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
  },
  checkmark: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  consentText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 18,
  },
  nextBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: 40,
  },
  nextBtnDisabled: {
    opacity: 0.4,
  },
  nextBtnText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});