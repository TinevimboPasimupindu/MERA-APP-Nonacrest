import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../../services/api';

const IncomingPatientScreen: React.FC = () => {
  const router = useRouter();
  const { incidentId } = useLocalSearchParams<{ incidentId: string }>();
  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [markingReady, setMarkingReady] = useState(false);

  useEffect(() => {
    const fetchIncident = async () => {
      if (!incidentId) return;
      try {
        const data = await apiCall(`/incidents/${incidentId}/hospital_detail/`, 'GET', undefined, true);
        setIncident(data);
      } catch (err) {
        console.log('Error fetching incident:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchIncident();
  }, [incidentId]);

  const handleMarkReady = async () => {
    setMarkingReady(true);
    try {
      await apiCall(`/incidents/${incidentId}/mark_ready/`, 'POST', {}, true);
      Alert.alert('Ready', 'Hospital marked as ready to receive patient.');
    } catch (err: any) {
      Alert.alert('Error', err.detail || 'Could not mark as ready.');
    } finally {
      setMarkingReady(false);
    }
  };

  const patient = incident?.patient_summary;
  const treatmentNote = incident?.treatment_note;
  const ambulanceName = incident?.ambulance_name || 'Ambulance';

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#4ADE80" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Incoming Patient</Text>
          <Text style={styles.headerSubtitle}>Hospital Portal</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Ambulance ETA banner */}
        <View style={styles.ambulanceBanner}>
          <View style={styles.ambulanceTopRow}>
            <View style={styles.ambulanceLiveDot} />
            <Text style={styles.ambulanceTitle}>
              🚑  {ambulanceName}
            </Text>
          </View>
          <Text style={styles.ambulanceMeta}>
            ETA {incident?.eta_minutes || '—'} minutes
          </Text>
          <Text style={styles.ambulanceStatus}>
            Status: <Text style={styles.ambulanceStatusValue}>
              {incident?.status?.replace(/_/g, ' ').toUpperCase() || '—'}
            </Text>
          </Text>
        </View>

        {/* Patient identity */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {getInitials(patient?.full_name || '?')}
            </Text>
          </View>
          <View style={styles.identityInfo}>
            <Text style={styles.patientName}>
              {patient?.full_name || 'Unknown Patient'}
            </Text>
            <Text style={styles.patientMeta}>
              Blood Type: {patient?.blood_type || '—'}
            </Text>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedCheck}>✓</Text>
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          </View>
        </View>

        {/* Medical summary */}
        <Text style={styles.sectionLabel}>PATIENT MEDICAL SUMMARY</Text>
        <View style={styles.medicalCard}>
          <View style={styles.medicalRow}>
            <Text style={styles.medicalRowLabel}>CONDITIONS</Text>
            <Text style={styles.medicalRowValue}>
              {patient?.chronic_conditions || 'None listed'}
            </Text>
          </View>
          <View style={styles.medicalDivider} />
          <View style={styles.medicalRow}>
            <Text style={styles.medicalRowLabel}>ALLERGIES</Text>
            <Text style={styles.medicalRowValue}>
              {patient?.known_allergies
                ? <Text>⚠  {patient.known_allergies}</Text>
                : 'None listed'}
            </Text>
          </View>
        </View>

        {/* Treatment notes */}
        <Text style={styles.sectionLabel}>AMBULANCE TREATMENT NOTES</Text>
        <View style={styles.treatmentCard}>
          {treatmentNote ? (
            <>
              <Text style={styles.treatmentSubmittedBy}>
                📋  Submitted by {ambulanceName}
              </Text>
              <Text style={styles.treatmentNote}>
                {treatmentNote.chief_complaint || 'No chief complaint recorded.'}
              </Text>
              {treatmentNote.treatment_administered ? (
                <Text style={[styles.treatmentNote, { marginTop: 8 }]}>
                  Treatment: {treatmentNote.treatment_administered}
                </Text>
              ) : null}
              {treatmentNote.blood_pressure ? (
                <Text style={[styles.treatmentNote, { marginTop: 8 }]}>
                  Vitals — BP: {treatmentNote.blood_pressure}
                  {treatmentNote.spo2 ? `  SpO2: ${treatmentNote.spo2}` : ''}
                  {treatmentNote.heart_rate ? `  HR: ${treatmentNote.heart_rate}` : ''}
                </Text>
              ) : null}
              {treatmentNote.medications_given ? (
                <Text style={[styles.treatmentNote, { marginTop: 8 }]}>
                  Medications: {treatmentNote.medications_given}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.treatmentNote}>
              No treatment notes submitted yet.
            </Text>
          )}
        </View>

      </ScrollView>

      {/* Footer buttons */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryButton, markingReady && { opacity: 0.6 }]}
          onPress={handleMarkReady}
          activeOpacity={0.85}
          disabled={markingReady}
        >
          {markingReady ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Mark as Ready to Receive</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ghostButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.ghostButtonText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default IncomingPatientScreen;

const Colors = {
  background: '#0A0E1A',
  surface: '#111827',
  cardBg: '#0F172A',
  cardBorder: '#1E293B',
  ambulanceBg: '#2D0E0E',
  ambulanceBorder: '#DC2626',
  ambulanceLiveDot: '#EF4444',
  treatmentBg: '#1A1A00',
  treatmentBorder: '#D97706',
  treatmentLabel: '#F59E0B',
  verifiedGreen: '#4ADE80',
  primaryButton: '#16A34A',
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  label: '#64748B',
  avatarBg: '#1D4ED8',
  warningColor: '#F59E0B',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#0D1F0D',
    borderBottomWidth: 1,
    borderBottomColor: '#1A3A1A',
  },
  backButton: { marginRight: 12, padding: 4 },
  backArrow: { color: Colors.textPrimary, fontSize: 20 },
  headerTitles: { flex: 1, alignItems: 'center', marginRight: 28 },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 16 },
  ambulanceBanner: {
    backgroundColor: Colors.ambulanceBg,
    borderWidth: 1.5,
    borderColor: Colors.ambulanceBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  ambulanceTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  ambulanceLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.ambulanceLiveDot },
  ambulanceTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  ambulanceMeta: { color: Colors.textSecondary, fontSize: 13, marginBottom: 4 },
  ambulanceStatus: { color: Colors.textMuted, fontSize: 13 },
  ambulanceStatusValue: { color: Colors.ambulanceLiveDot, fontWeight: '600' },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    gap: 14,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.avatarBg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  identityInfo: { flex: 1 },
  patientName: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  patientMeta: { color: Colors.textSecondary, fontSize: 13, marginBottom: 6 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedCheck: { color: Colors.verifiedGreen, fontSize: 13, fontWeight: '700' },
  verifiedText: { color: Colors.verifiedGreen, fontSize: 13, fontWeight: '600' },
  sectionLabel: {
    color: Colors.label,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  medicalCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  medicalRow: { paddingHorizontal: 14, paddingVertical: 12 },
  medicalRowLabel: {
    color: Colors.label, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.1, marginBottom: 4,
  },
  medicalRowValue: { color: Colors.textPrimary, fontSize: 14, fontWeight: '500' },
  medicalDivider: { height: 1, backgroundColor: Colors.cardBorder },
  treatmentCard: {
    backgroundColor: Colors.treatmentBg,
    borderWidth: 1.5,
    borderColor: Colors.treatmentBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  treatmentSubmittedBy: { color: Colors.treatmentLabel, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  treatmentNote: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  footer: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8, gap: 10 },
  primaryButton: {
    backgroundColor: Colors.primaryButton,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  ghostButton: {
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.cardBorder,
  },
  ghostButtonText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '500' },
});