import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../../services/api';

const VerifyPatientScreen: React.FC = () => {
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [clinicianNotes, setClinicianNotes] = useState('');
  const [notesFocused, setNotesFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!requestId) return;
      try {
        const profileData = await apiCall(`/verification/${requestId}/review/`, 'GET', undefined, true);
        setProfile(profileData);
      } catch (err) {
        console.log('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [requestId]);

  const handleAction = async (action: 'approve' | 'flag' | 'request_info') => {
    if ((action === 'flag' || action === 'request_info') && !clinicianNotes.trim()) {
      Alert.alert('Note Required', 'Please add a note before flagging or requesting more info.');
      return;
    }
    setSubmitting(true);
    try {
      await apiCall(`/verification/${requestId}/action/`, 'POST', {
        action,
        note: clinicianNotes,
      }, true);

      const messages: Record<string, string> = {
        approve: 'Patient has been approved and verified.',
        flag: 'Patient has been flagged for an in-person visit.',
        request_info: 'Patient has been notified to provide more information.',
      };

      Alert.alert('Done', messages[action], [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.detail || 'Could not complete action.');
    } finally {
      setSubmitting(false);
    }
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

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const fields = [
    { id: 'blood', label: 'BLOOD TYPE', value: profile?.blood_type || '—' },
    { id: 'conditions', label: 'CONDITIONS', value: profile?.chronic_conditions || 'None listed' },
    { id: 'medications', label: 'MEDICATIONS', value: profile?.current_medications || 'None listed' },
    { id: 'allergies', label: 'ALLERGIES', value: profile?.known_allergies || 'None listed', warning: true },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.headerBg} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Verify Patient</Text>
            <Text style={styles.headerSubtitle}>Review submitted medical profile</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: '#92400E' }]}>
            <Text style={[styles.statusBadgeText, { color: '#FCD34D' }]}>🕐 Pending</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* Medical fields */}
          <Text style={styles.sectionTitle}>Submitted Medical Information</Text>
          <Text style={styles.sectionSubtitle}>Review and verify each field below</Text>

          <View style={styles.medicalCard}>
            {fields.map((field, idx) => (
              <React.Fragment key={field.id}>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldContent}>
                    <Text style={styles.fieldRowLabel}>{field.label}</Text>
                    <Text style={styles.fieldRowValue}>
                      {field.warning && field.value !== 'None listed' && (
                        <Text style={{ color: Colors.warningColor }}>⚠  </Text>
                      )}
                      {field.value}
                    </Text>
                  </View>
                  <Text style={styles.iconVerified}>✓</Text>
                </View>
                {idx < fields.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>

          {/* Clinician notes */}
          <Text style={styles.notesLabel}>
            CLINICIAN NOTES <Text style={styles.notesMuted}>(shown to patient if flagged)</Text>
          </Text>
          <TextInput
            style={[styles.notesInput, notesFocused && styles.notesInputFocused]}
            placeholder="Add notes for the patient..."
            placeholderTextColor={Colors.placeholder}
            value={clinicianNotes}
            onChangeText={setClinicianNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            onFocus={() => setNotesFocused(true)}
            onBlur={() => setNotesFocused(false)}
          />
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.approveButton, submitting && { opacity: 0.6 }]}
            onPress={() => handleAction('approve')}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.approveButtonText}>Approve & Verify</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.flagButton}
            onPress={() => handleAction('flag')}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.flagButtonText}>Flag for In-Person Visit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.requestButton}
            onPress={() => handleAction('request_info')}
            disabled={submitting}
            activeOpacity={0.7}
          >
            <Text style={styles.requestButtonText}>Request More Info</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default VerifyPatientScreen;

const Colors = {
  background: '#0A0E1A',
  headerBg: '#0D1F0D',
  headerBorder: '#1A3A1A',
  cardBg: '#0F172A',
  cardBorder: '#1E293B',
  avatarBg: '#065F46',
  approveButton: '#16A34A',
  flagButtonBg: '#2D1200',
  flagButtonBorder: '#D97706',
  flagButtonText: '#F59E0B',
  requestButtonBg: '#111827',
  requestButtonBorder: '#1E293B',
  iconVerified: '#4ADE80',
  iconQuery: '#F59E0B',
  warningColor: '#F59E0B',
  placeholder: '#475569',
  label: '#64748B',
  notesMuted: '#475569',
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  requestingHospital: '#60A5FA',
  inputFocusBorder: '#3B82F6',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.headerBorder,
  },
  backButton: { marginRight: 8, padding: 4 },
  backArrow: { color: Colors.textPrimary, fontSize: 20 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  headerSubtitle: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  sectionTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 2 },
  sectionSubtitle: { color: Colors.textSecondary, fontSize: 12, marginBottom: 12 },
  medicalCard: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    justifyContent: 'space-between',
  },
  fieldContent: { flex: 1, marginRight: 10 },
  fieldRowLabel: {
    color: Colors.label, fontSize: 9, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: 3,
  },
  fieldRowValue: { color: Colors.textPrimary, fontSize: 14 },
  divider: { height: 1, backgroundColor: Colors.cardBorder },
  iconVerified: { color: Colors.iconVerified, fontSize: 18, fontWeight: '700' },
  notesLabel: {
    color: Colors.label, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: 8,
  },
  notesMuted: { color: Colors.notesMuted, fontWeight: '400', letterSpacing: 0 },
  notesInput: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    minHeight: 90,
    marginBottom: 4,
  },
  notesInputFocused: { borderColor: Colors.inputFocusBorder },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20, gap: 10 },
  approveButton: {
    backgroundColor: Colors.approveButton,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  approveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  flagButton: {
    backgroundColor: Colors.flagButtonBg,
    borderWidth: 1.5,
    borderColor: Colors.flagButtonBorder,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  flagButtonText: { color: Colors.flagButtonText, fontSize: 15, fontWeight: '700' },
  requestButton: {
    backgroundColor: Colors.requestButtonBg,
    borderWidth: 1,
    borderColor: Colors.requestButtonBorder,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  requestButtonText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '500' },
});