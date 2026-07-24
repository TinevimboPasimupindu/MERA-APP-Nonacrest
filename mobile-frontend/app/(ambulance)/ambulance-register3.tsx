import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { Colors, Spacing } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

export default function AmbulanceRegisterStep3() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [agreed, setAgreed] = useState(false);
  const [emsLicense, setEmsLicense] = useState<string | null>(null);
  const [hpcsa, setHpcsa] = useState<string | null>(null);
  const [fleetInsurance, setFleetInsurance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  if (!fontsLoaded) return null;

  const pickDocument = async (setter: (name: string) => void) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        setter(result.assets[0].name);
      }
    } catch (err) {
      console.log('Error picking document:', err);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await apiCall(ENDPOINTS.registerAmbulance, 'POST', {
        service_name: params.service_name,
        service_type: params.service_type?.toString().toLowerCase(),
        operational_areas: params.operational_areas,
        dispatch_phone: params.dispatch_phone,
        dispatch_address: params.dispatch_address,
        capabilities: params.capabilities?.toString().split(',') || [],
        number_of_active_ambulances: parseInt(params.number_of_active_ambulances as string) || 1,
        email: params.email,
        admin_contact_name: params.admin_contact_name,
        admin_phone: params.admin_phone,
        password: params.password,
        confirm_password: params.confirm_password,
        terms_consent: true,
      });

      Alert.alert(
        'Registration Submitted!',
        'Your ambulance service registration has been submitted. The MERA team will review and activate your account within 2 business days.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login' as any) }]
      );

    } catch (err: any) {
      console.log('Registration error:', JSON.stringify(err));
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
    <View style={styles.screen}>

      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <Text style={styles.heading}>Register an Ambulance</Text>
        <Text style={styles.subHeading}>Step 3 of 3 • Verify & Submit</Text>
        <View style={styles.progressRow}>
          <View style={styles.activeBar} />
          <View style={styles.activeBar} />
          <View style={styles.activeBar} />
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >

        <Text style={styles.reviewHeading}>Review your submission</Text>
        <Text style={styles.reviewSubtext}>
          MERA will verify your service before granting access.
        </Text>

        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTitleRow}>
            <Text style={styles.summaryEmoji}>🚑</Text>
            <Text style={styles.summaryName}>{params.service_name || 'Your Service'}</Text>
          </View>
          <Text style={styles.summaryMeta}>
            {params.service_type} Service • {params.operational_areas}
          </Text>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Coverage</Text>
            <Text style={styles.summaryValue}>{params.operational_areas}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Active Units</Text>
            <Text style={styles.summaryValue}>
              {params.number_of_active_ambulances} Ambulances • {params.capabilities}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Admin</Text>
            <Text style={styles.summaryValue}>{params.admin_contact_name}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Dispatch No.</Text>
            <Text style={styles.summaryValue}>{params.dispatch_phone} (24/7)</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Email</Text>
            <Text style={styles.summaryValue}>{params.email}</Text>
          </View>
        </View>

        {/* Supporting Documents */}
        <Text style={styles.sectionLabel}>SUPPORTING DOCUMENTS</Text>

        <View style={[styles.documentRow, emsLicense && styles.documentRowUploaded]}>
          <Text style={styles.documentName}>EMS Operating License</Text>
          <TouchableOpacity onPress={() => pickDocument((name) => setEmsLicense(name))}>
            <Text style={[styles.documentStatus, emsLicense && styles.uploadedText]}>
              {emsLicense ? 'Uploaded ✓' : 'Upload →'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.documentRow, hpcsa && styles.documentRowUploaded]}>
          <Text style={styles.documentName}>HPCSA / DOH Registration</Text>
          <TouchableOpacity onPress={() => pickDocument((name) => setHpcsa(name))}>
            <Text style={[styles.documentStatus, hpcsa && styles.uploadedText]}>
              {hpcsa ? 'Uploaded ✓' : 'Upload →'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.documentRow, fleetInsurance && styles.documentRowUploaded]}>
          <Text style={[styles.documentName, !fleetInsurance && styles.documentNameOptional]}>
            Fleet Insurance Certificate
          </Text>
          <TouchableOpacity onPress={() => pickDocument((name) => setFleetInsurance(name))}>
            <Text style={[styles.documentStatus, fleetInsurance && styles.uploadedText]}>
              {fleetInsurance ? 'Uploaded ✓' : 'Upload →'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Terms Checkbox */}
        <TouchableOpacity
          style={[styles.checkboxRow, agreed && styles.checkboxRowActive]}
          onPress={() => setAgreed(!agreed)}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxText}>
            I confirm this is a licensed EMS service and agree to MERA's dispatch terms of use.
          </Text>
        </TouchableOpacity>

        <Text style={styles.infoText}>
          After submitting, the MERA team will review and activate your account within 2 business days.
        </Text>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, (!agreed || !emsLicense || !hpcsa) && styles.submitButtonDisabled]}
          disabled={!agreed || !emsLicense || !hpcsa || loading}
          onPress={handleSubmit}
        >
          {loading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>Submit Ambulance Registration</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back & Edit</Text>
        </TouchableOpacity>

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
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 16,
    zIndex: 10,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subHeading: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeBar: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  scroll: { flex: 1 },
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 80,
  },
  reviewHeading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  reviewSubtext: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'left',
    marginBottom: 20,
  },
  summaryCard: {
    backgroundColor: '#1A1D35',
    borderWidth: 2,
    borderColor: Colors.ambulance,
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryEmoji: { fontSize: 24, marginRight: 10 },
  summaryName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.textPrimary,
  },
  summaryMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2D45',
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  summaryLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    width: 100,
  },
  summaryValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
  },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 2,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  documentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1D35',
    borderWidth: 1,
    borderColor: '#2A2D45',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  documentRowUploaded: { borderColor: Colors.ambulance },
  documentName: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.textPrimary,
  },
  documentNameOptional: { color: Colors.textSecondary },
  documentStatus: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.primary,
  },
  uploadedText: { color: Colors.ambulance },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1A1D35',
    borderWidth: 1,
    borderColor: '#2A2D45',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
    gap: 12,
  },
  checkboxRowActive: {
    borderColor: Colors.ambulance,
    backgroundColor: '#2A1500',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.ambulance,
    borderColor: Colors.ambulance,
  },
  checkmark: { color: Colors.white, fontSize: 14, fontWeight: 'bold' },
  checkboxText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 22,
  },
  infoText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: Colors.ambulance,
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.white,
  },
  backButton: {
    backgroundColor: '#1A1D35',
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  backButtonText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 18,
    color: Colors.textSecondary,
  },
});