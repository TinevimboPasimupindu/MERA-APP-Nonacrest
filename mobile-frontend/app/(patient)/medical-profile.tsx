import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

const BLOOD_TYPES = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];

export default function MedicalProfileScreen() {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  const [bloodType, setBloodType] = useState('');
  const [conditions, setConditions] = useState('');
  const [medications, setMedications] = useState('');
  const [allergies, setAllergies] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);

  const [tempBloodType, setTempBloodType] = useState('');
  const [tempConditions, setTempConditions] = useState('');
  const [tempMedications, setTempMedications] = useState('');
  const [tempAllergies, setTempAllergies] = useState('');
  const [tempNotes, setTempNotes] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [profileData, userData] = await Promise.all([
          apiCall(ENDPOINTS.medicalProfileMe, 'GET', undefined, true),
          apiCall(ENDPOINTS.me, 'GET', undefined, true),
        ]);
        setProfile(profileData);
        setUser(userData);
        setBloodType(profileData.blood_type || '');
        setConditions(profileData.chronic_conditions || '');
        setMedications(profileData.current_medications || '');
        setAllergies(profileData.known_allergies || '');
        setNotes(profileData.paramedic_notes || '');
        setConsent(profileData.data_sharing_consent || false);
      } catch (err) {
        console.log('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getInitials = (name: string) => {
    if (!name) return 'ME';
    return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const startEdit = () => {
    setTempBloodType(bloodType);
    setTempConditions(conditions);
    setTempMedications(medications);
    setTempAllergies(allergies);
    setTempNotes(notes);
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updated = await apiCall(ENDPOINTS.medicalProfileSubmit, 'PATCH', {
        blood_type: tempBloodType,
        chronic_conditions: tempConditions,
        current_medications: tempMedications,
        known_allergies: tempAllergies,
        paramedic_notes: tempNotes,
        data_sharing_consent: consent,
      }, true);

      setBloodType(tempBloodType);
      setConditions(tempConditions);
      setMedications(tempMedications);
      setAllergies(tempAllergies);
      setNotes(tempNotes);
      setProfile(updated);
      setEditing(false);

      Alert.alert('Saved', 'Your medical profile has been updated.');
    } catch (err: any) {
      Alert.alert('Save Failed', err.detail || 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => setEditing(false);

  const handleConsentToggle = async (value: boolean) => {
    setConsent(value);
    try {
      await apiCall('/medical-profile/consent/', 'POST', { consent: value }, true);
    } catch (err) {
      console.log('Consent toggle error:', err);
      setConsent(!value);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <View style={styles.header}>
          {editing ? (
            <TouchableOpacity onPress={cancelEdit}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>
            {editing ? 'Edit Profile' : 'Medical Profile'}
          </Text>
          {editing ? (
            <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {editing && (
          <View style={styles.editBanner}>
            <Text style={styles.editBannerText}>
              ✏️  You are now editing your medical profile. Tap Save when done.
            </Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Identity card */}
          <View style={styles.identityCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitials(user?.display_name || 'ME')}
              </Text>
            </View>
            <View style={styles.identityInfo}>
              <Text style={styles.identityName}>
                {user?.display_name || 'Patient'}
              </Text>
              <Text style={styles.identitySub}>Patient</Text>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>
                  {profile?.is_verified ? '✓  Verified' : '⏳  Pending'}
                </Text>
              </View>
            </View>
            <Text style={styles.updatedText}>
              {profile?.last_updated_at
                ? `Updated\n${new Date(profile.last_updated_at).toLocaleDateString()}`
                : 'Not yet\nupdated'}
            </Text>
          </View>

          {/* Blood type */}
          <Text style={styles.fieldLabel}>BLOOD TYPE</Text>
          <View style={styles.chipRow}>
            {BLOOD_TYPES.map((bt) => (
              <TouchableOpacity
                key={bt}
                style={[
                  styles.chip,
                  (editing ? tempBloodType : bloodType) === bt && styles.chipSelected,
                  !editing && styles.chipReadOnly,
                ]}
                onPress={() => editing && setTempBloodType(bt)}
                disabled={!editing}
              >
                <Text style={[
                  styles.chipText,
                  (editing ? tempBloodType : bloodType) === bt && styles.chipTextSelected,
                ]}>
                  {bt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Conditions */}
          <Text style={styles.fieldLabel}>CHRONIC CONDITIONS</Text>
          <TextInput
            style={[styles.input, editing && styles.inputActive]}
            value={editing ? tempConditions : conditions}
            onChangeText={setTempConditions}
            editable={editing}
            multiline
            placeholderTextColor={Colors.textSecondary}
          />

          {/* Medications */}
          <Text style={styles.fieldLabel}>MEDICATIONS</Text>
          <TextInput
            style={[styles.input, editing && styles.inputActive]}
            value={editing ? tempMedications : medications}
            onChangeText={setTempMedications}
            editable={editing}
            multiline
            placeholderTextColor={Colors.textSecondary}
          />

          {/* Allergies */}
          <Text style={styles.fieldLabel}>KNOWN ALLERGIES</Text>
          <TextInput
            style={[styles.input, editing && styles.inputActive]}
            value={editing ? tempAllergies : allergies}
            onChangeText={setTempAllergies}
            editable={editing}
            multiline
            placeholderTextColor={Colors.textSecondary}
          />

          {/* Notes */}
          <Text style={styles.fieldLabel}>NOTES FOR PARAMEDICS</Text>
          <TextInput
            style={[styles.input, styles.inputTall, editing && styles.inputActive]}
            value={editing ? tempNotes : notes}
            onChangeText={setTempNotes}
            editable={editing}
            multiline
            placeholderTextColor={Colors.textSecondary}
          />

          {/* Consent toggle */}
          <View style={styles.consentCard}>
            <Text style={styles.consentIcon}>🔒</Text>
            <View style={styles.consentContent}>
              <Text style={styles.consentTitle}>Share data with hospitals & ambulances</Text>
              <Text style={styles.consentSub}>
                {consent ? 'Consent is active' : 'Consent is off'}
              </Text>
            </View>
            <Switch
              value={consent}
              onValueChange={handleConsentToggle}
              trackColor={{ false: Colors.surface, true: Colors.success }}
              thumbColor={Colors.white}
            />
          </View>

          {/* Save / Discard buttons when editing */}
          {editing && (
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.saveFullBtn} onPress={saveEdit} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.saveFullBtnText}>💾  Save Changes</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.discardBtn} onPress={cancelEdit}>
                <Text style={styles.discardBtnText}>Discard Changes</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  stickyHeader: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  scroll: { flex: 1, paddingHorizontal: Spacing.md },
  scrollContent: { paddingTop: Spacing.md, paddingBottom: 40 },
  backText: { color: Colors.textSecondary, fontSize: FontSizes.xl },
  cancelText: { color: Colors.danger, fontSize: FontSizes.sm, fontWeight: '600' },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: '700' },
  editBtn: {
    backgroundColor: '#0D1B3E',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  editBtnText: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: '600' },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    minWidth: 50,
    alignItems: 'center',
  },
  saveBtnText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: '600' },
  editBanner: {
    backgroundColor: '#0D1B3E',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  editBannerText: { color: Colors.primary, fontSize: FontSizes.xs, lineHeight: 18 },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11122A',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#2A2B40',
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#162038',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.primary, fontSize: FontSizes.lg, fontWeight: '700' },
  identityInfo: { flex: 1 },
  identityName: { color: Colors.textPrimary, fontSize: FontSizes.md, fontWeight: '700', marginBottom: 2 },
  identitySub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginBottom: 6 },
  verifiedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0A2010',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  verifiedText: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: '600' },
  updatedText: { color: Colors.textSecondary, fontSize: FontSizes.xs, textAlign: 'right', lineHeight: 16 },
  fieldLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#1A1B2E',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#2A2B40',
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipReadOnly: { opacity: 0.8 },
  chipText: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  chipTextSelected: { color: Colors.white, fontWeight: '600' },
  input: {
    backgroundColor: '#0D0E1A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    minHeight: 52,
  },
  inputActive: { borderColor: Colors.primary, borderWidth: 1.5 },
  inputTall: { minHeight: 70, textAlignVertical: 'top' },
  consentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11122A',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#2A2B40',
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  consentIcon: { fontSize: 20 },
  consentContent: { flex: 1 },
  consentTitle: { color: Colors.textPrimary, fontSize: FontSizes.sm, fontWeight: '600', marginBottom: 2 },
  consentSub: { color: Colors.success, fontSize: FontSizes.xs },
  editActions: { marginTop: Spacing.lg, gap: Spacing.sm },
  saveFullBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  saveFullBtnText: { color: Colors.white, fontSize: FontSizes.md, fontWeight: '600' },
  discardBtn: {
    backgroundColor: '#11122A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  discardBtnText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: '500' },
});