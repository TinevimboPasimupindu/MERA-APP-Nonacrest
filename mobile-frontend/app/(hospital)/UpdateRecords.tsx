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
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiCall } from '../../services/api';

type FilterKey = 'all' | 'verified' | 'pending';

const Colors = {
  bg: '#0A0D1A', surface: '#131929', surfaceBorder: '#1E2A3A',
  cardBg: '#151D2E', cardBorder: '#1E2A3A', headerBg: '#0D1220',
  searchBg: '#151D2E', searchBorder: '#4A90E2',
  filterActive: '#4A90E2', filterActiveTxt: '#FFFFFF',
  filterInactive: '#151D2E', filterInactiveTxt: '#8B949E', filterBorder: '#1E2A3A',
  verifiedBg: '#0D2818', verifiedText: '#4CAF50',
  pendingBg: '#3D2000', pendingText: '#FF9800',
  textPrimary: '#E6EDF3', textSecondary: '#8B949E',
  textMuted: '#6B7A8D', textLabel: '#6B7A8D',
  avatarBg: '#1D3461', avatarText: '#7EB8F7',
};

export default function UpdateRecords(): React.JSX.Element {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const [pendingData, approvedData] = await Promise.all([
          apiCall('/verification/queue/', 'GET', undefined, true),
          apiCall('/verification/approved/', 'GET', undefined, true),
        ]);
        const pending = Array.isArray(pendingData) ? pendingData : pendingData.results || [];
        const approved = Array.isArray(approvedData) ? approvedData : approvedData.results || [];
        setPatients([...approved, ...pending]);
      } catch (err) {
        console.log('Error fetching patients:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, []);

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
  };

  const getStatusLabel = (status: string) => {
    if (status === 'approved') return { label: 'Verified', bg: Colors.verifiedBg, text: Colors.verifiedText };
    return { label: 'Pending', bg: Colors.pendingBg, text: Colors.pendingText };
  };

  const filtered = patients.filter((p) => {
    const name = p.patient_name || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const handleSelect = (requestId: string, patientId: string, patientName: string): void => {
    router.push(`/(hospital)/EditRecordScreen?requestId=${requestId}&patientId=${patientId}&patientName=${encodeURIComponent(patientName)}` as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.headerBg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Update Records</Text>
          <Text style={styles.headerSubtitle}>Search or select a patient</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Search by name..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>MY PATIENTS</Text>

        {loading ? (
          <ActivityIndicator color="#4A90E2" size="large" style={{ marginTop: 40 }} />
        ) : filtered.length > 0 ? (
          filtered.map((p) => {
            const statusConfig = getStatusLabel(p.status);
            return (
              <TouchableOpacity
                key={p.id}
                style={styles.card}
                onPress={() => handleSelect(p.id, p.patient_id, p.patient_name)}
                activeOpacity={0.8}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(p.patient_name || '')}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.patientName}>{p.patient_name || 'Unknown'}</Text>
                  <Text style={styles.patientConditions}>
                    Submitted {p.hours_since_submission
                      ? `${Math.floor(p.hours_since_submission)}h ago`
                      : 'recently'}
                  </Text>
                </View>
                <View style={styles.cardRight}>
                  <View style={[styles.badge, { backgroundColor: statusConfig.bg }]}>
                    <Text style={[styles.badgeText, { color: statusConfig.text }]}>
                      {statusConfig.label}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <Text style={styles.emptyText}>No patients found.</Text>
        )}
      </ScrollView>
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
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: Colors.textSecondary, fontSize: 11, marginTop: 2, textAlign: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  searchInput: {
    backgroundColor: Colors.searchBg, borderWidth: 1.5, borderColor: Colors.searchBorder,
    borderRadius: 30, paddingHorizontal: 18, paddingVertical: 12,
    color: Colors.textPrimary, fontSize: 14,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textLabel,
    letterSpacing: 1, marginBottom: 10,
  },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.cardBorder,
    borderRadius: 14, padding: 14, marginBottom: 10, gap: 12,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.avatarBg, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.avatarText, fontSize: 15, fontWeight: '700' },
  cardInfo: { flex: 1 },
  patientName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  patientConditions: { color: Colors.textSecondary, fontSize: 12 },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  chevron: { color: Colors.textMuted, fontSize: 18 },
  emptyText: { color: Colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },
});