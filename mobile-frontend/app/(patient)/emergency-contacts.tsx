import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  Linking,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

type Contact = {
  id: string;
  full_name: string;
  relationship: string;
  phone_number: string;
  priority_order: number;
};

const RELATIONSHIP_OPTIONS = [
  'spouse', 'parent', 'sibling', 'child', 'friend', 'colleague', 'guardian', 'other'
];

export default function EmergencyContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRel, setNewRel] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // ─── Fetch ───────────────────────────────────────────────────────────────────
  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiCall(ENDPOINTS.emergencyContacts, 'GET', undefined, true);
      setContacts(Array.isArray(data) ? data : data.results ?? []);
    } catch (err: any) {
      setError('Failed to load contacts. Tap retry to try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // ─── Call ────────────────────────────────────────────────────────────────────
  const callContact = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // ─── Delete ──────────────────────────────────────────────────────────────────
  const deleteContact = (id: string) => {
    Alert.alert('Remove Contact', 'Are you sure you want to remove this contact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiCall(`${ENDPOINTS.emergencyContacts}${id}/`, 'DELETE', undefined, true);
            setContacts((prev) => prev.filter((c) => c.id !== id));
          } catch {
            Alert.alert('Error', 'Could not remove contact. Please try again.');
          }
        },
      },
    ]);
  };

  // ─── Add ─────────────────────────────────────────────────────────────────────
  const addContact = async () => {
    if (!newName || !newPhone || !newRel) return;

    if (contacts.length >= 5) {
      Alert.alert('Limit Reached', 'You can only add up to 5 emergency contacts.');
      return;
    }

    try {
      setSaving(true);
      const created = await apiCall(
        ENDPOINTS.emergencyContacts,
        'POST',
        {
          full_name: newName,
          relationship: newRel,
          phone_number: newPhone,
          priority_order: contacts.length + 1,
        },
        true
      );
      setContacts((prev) => [...prev, created]);
      setShowModal(false);
      setNewName('');
      setNewRel('');
      setNewPhone('');
    } catch (err: any) {
      const message = err?.non_field_errors?.[0] ?? err?.detail ?? 'Could not save contact. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  const closeModal = () => {
    setShowModal(false);
    setNewName('');
    setNewRel('');
    setNewPhone('');
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Emergency Contacts</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Add button */}
        <TouchableOpacity
          style={[styles.addBtn, contacts.length >= 5 && styles.addBtnDisabled]}
          onPress={() => setShowModal(true)}
          disabled={contacts.length >= 5}
        >
          <Text style={styles.addBtnText}>
            {contacts.length >= 5 ? 'Max 5 Contacts Reached' : '+ Add Contact'}
          </Text>
        </TouchableOpacity>

        {/* Loading */}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        )}

        {/* Error */}
        {!loading && error && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchContacts}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Contact list */}
        {!loading && !error && (
          <>
            <Text style={styles.sectionLabel}>MY CONTACTS ({contacts.length}/5)</Text>
            {contacts.map((c) => (
              <View key={c.id} style={styles.contactCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(c.full_name)}</Text>
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{c.full_name}</Text>
                  <Text style={styles.contactSub}>{c.relationship}  •  {c.phone_number}</Text>
                </View>
                <TouchableOpacity style={styles.callBtn} onPress={() => callContact(c.phone_number)}>
                  <Text style={styles.callIcon}>📞</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteContact(c.id)}>
                  <Text style={styles.deleteIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))}

            {contacts.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📞</Text>
                <Text style={styles.emptyText}>No contacts added yet</Text>
                <Text style={styles.emptySub}>
                  Add contacts who will be automatically notified when you press SOS.
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Contact Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.modalDismiss} onPress={closeModal} activeOpacity={1} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Emergency Contact</Text>

            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter full name"
              placeholderTextColor={Colors.textSecondary}
              value={newName}
              onChangeText={setNewName}
            />

            <Text style={styles.inputLabel}>Relationship</Text>
            <View style={styles.relationshipGrid}>
              {RELATIONSHIP_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setNewRel(option)}
                  style={[
                    styles.relationshipChip,
                    newRel === option && styles.relationshipChipActive,
                  ]}
                >
                  <Text style={[
                    styles.relationshipChipText,
                    newRel === option && styles.relationshipChipTextActive,
                  ]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="+27 XX XXX XXXX"
              placeholderTextColor={Colors.textSecondary}
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSaveBtn,
                  (!newName || !newPhone || !newRel || saving) && styles.modalSaveBtnDisabled,
                ]}
                onPress={addContact}
                disabled={!newName || !newPhone || !newRel || saving}
              >
                {saving
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={styles.modalSaveText}>Save Contact</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1, paddingHorizontal: Spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backText: { color: Colors.textSecondary, fontSize: FontSizes.xl },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: '700' },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: Colors.white, fontSize: FontSizes.md, fontWeight: '600' },
  centered: { alignItems: 'center', paddingVertical: Spacing.xxl },
  errorText: { color: Colors.textSecondary, fontSize: FontSizes.sm, marginBottom: Spacing.md, textAlign: 'center' },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  retryText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: '600' },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11122A',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#2A2B40',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#162038',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: '700' },
  contactInfo: { flex: 1 },
  contactName: { color: Colors.textPrimary, fontSize: FontSizes.sm, fontWeight: '600', marginBottom: 2 },
  contactSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, textTransform: 'capitalize' },
  callBtn: { padding: Spacing.sm },
  callIcon: { fontSize: 20 },
  deleteBtn: { padding: Spacing.sm },
  deleteIcon: { fontSize: 16 },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { color: Colors.textPrimary, fontSize: FontSizes.md, fontWeight: '600', marginBottom: Spacing.sm },
  emptySub: { color: Colors.textSecondary, fontSize: FontSizes.sm, textAlign: 'center', lineHeight: 20 },
  relationshipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  relationshipChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2B40',
    backgroundColor: 'transparent',
  },
  relationshipChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  relationshipChipText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    textTransform: 'capitalize',
  },
  relationshipChipTextActive: {
    color: Colors.white,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalDismiss: { flex: 1 },
  modalCard: {
    backgroundColor: '#11122A',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  inputLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  modalInput: {
    backgroundColor: '#0D0E1A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
  },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#1A1B2E',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  modalCancelText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: '600' },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: { opacity: 0.4 },
  modalSaveText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: '600' },
});