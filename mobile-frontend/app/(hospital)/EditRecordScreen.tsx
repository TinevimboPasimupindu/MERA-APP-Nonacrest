import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiCall } from '../../services/api';

const Colors = {
  bg: '#0A0D1A', headerBg: '#0D1220', surface: '#131929',
  surfaceBorder: '#1E2A3A', cardBg: '#151D2E', cardBorder: '#1E2A3A',
  inputBg: '#151D2E', inputBorder: '#1E2A3A', inputFocused: '#4A90E2',
  labelColor: '#6B7A8D', verifiedBg: '#0D2818', verifiedText: '#4CAF50',
  saveBg: '#4A90E2', saveText: '#FFFFFF', discardBg: '#151D2E',
  discardBorder: '#1E2A3A', discardText: '#8B949E',
  avatarBg: '#1D3461', avatarText: '#7EB8F7',
  textPrimary: '#E6EDF3', textSecondary: '#8B949E', textMuted: '#6B7A8D',
};

const Field: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  multiline?: boolean; placeholder?: string;
}> = ({ label, value, onChange, multiline = false, placeholder }) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        style={[fieldStyles.input, multiline && fieldStyles.inputMulti, focused && fieldStyles.inputFocused]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
};

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  label: { fontSize: 11, fontWeight: '700', color: Colors.labelColor, letterSpacing: 1, marginBottom: 8 },
  input: {
    backgroundColor: Colors.inputBg, borderWidth: 1.5, borderColor: Colors.inputBorder,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: Colors.textPrimary, fontSize: 15,
  },
  inputMulti: { minHeight: 100, paddingTop: 14 },
  inputFocused: { borderColor: Colors.inputFocused },
});

export default function EditRecordScreen(): React.JSX.Element {
  const router = useRouter();
  const { requestId, patientId, patientName } = useLocalSearchParams<{ requestId: string; patientId: string; patientName: string }>();  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [conditions, setConditions] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medication, setMedication] = useState('');
  const [emergencyNote, setEmergencyNote] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!requestId) return;
      try {
        const data = await apiCall(`/verification/${requestId}/review/`, 'GET', undefined, true);
        console.log('Profile data:', JSON.stringify(data));
        setProfile(data);
        setConditions(data.chronic_conditions || '');
        setAllergies(data.known_allergies || '');
        setMedication(data.current_medications || '');
        setEmergencyNote(data.paramedic_notes || '');
      } catch (err) {
        console.log('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [requestId]);
  

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      // Hospital edit uses the medical profile endpoint
      await apiCall(`/medical-profile/${patientId}/hospital_edit/`, 'PATCH', {
        chronic_conditions: conditions,
        known_allergies: allergies,
        current_medications: medication,
        paramedic_notes: emergencyNote,
      }, true);

      Alert.alert('Record Updated', 'Patient record has been saved successfully.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.detail || 'Could not save record.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = (): void => {
    Alert.alert('Discard Changes', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#4A90E2" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.headerBg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Record</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Patient Card */}
          <View style={styles.patientCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitials(profile?.patient_name || '?')}
              </Text>
            </View>
            <View style={styles.patientInfo}>
              <Text style={styles.patientName}>{patientName ? decodeURIComponent(patientName as string) : 'Patient'}</Text>
              <Text style={styles.patientMeta}>Blood Type: {profile?.blood_type || '—'}</Text>
              <View style={styles.patientBottomRow}>
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓  Verified</Text>
                </View>
              </View>
            </View>
          </View>

          <Field label="CHRONIC CONDITIONS" value={conditions} onChange={setConditions} />
          <Field label="ALLERGIES" value={allergies} onChange={setAllergies} />
          <Field label="CURRENT MEDICATION" value={medication} onChange={setMedication} />
          <Field
            label="EMERGENCY INSTRUCTIONS FOR PARAMEDICS"
            value={emergencyNote}
            onChange={setEmergencyNote}
            multiline
            placeholder="Add notes for paramedics..."
          />

          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color={Colors.saveText} /> : <Text style={styles.saveBtnText}>Save & Update Record</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard} activeOpacity={0.8}>
            <Text style={styles.discardBtnText}>Discard Changes</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: Colors.headerBg, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBorder,
  },
  backBtn: { padding: 4 },
  backArrow: { color: Colors.textPrimary, fontSize: 20 },
  headerTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  patientCard: {
    flexDirection: 'row', backgroundColor: Colors.cardBg, borderWidth: 1,
    borderColor: Colors.cardBorder, borderRadius: 14, padding: 14,
    marginBottom: 24, gap: 12, alignItems: 'flex-start',
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.avatarBg, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.avatarText, fontSize: 16, fontWeight: '700' },
  patientInfo: { flex: 1 },
  patientName: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 3 },
  patientMeta: { color: Colors.textSecondary, fontSize: 13, marginBottom: 8 },
  patientBottomRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  verifiedBadge: { backgroundColor: Colors.verifiedBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  verifiedText: { color: Colors.verifiedText, fontSize: 12, fontWeight: '700' },
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    gap: 10, backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.surfaceBorder,
  },
  saveBtn: { backgroundColor: Colors.saveBg, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: Colors.saveText, fontSize: 16, fontWeight: '700' },
  discardBtn: {
    backgroundColor: Colors.discardBg, borderWidth: 1, borderColor: Colors.discardBorder,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  discardBtnText: { color: Colors.discardText, fontSize: 15, fontWeight: '600' },
});