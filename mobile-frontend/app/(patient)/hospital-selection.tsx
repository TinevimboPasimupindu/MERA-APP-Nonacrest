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
  ActivityIndicator,
  Alert,
} from 'react-native';

import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall } from '../../services/api';

const FILTERS = ['All', 'On MERA', 'Public', 'Private'];

const NON_MERA_HOSPITALS = [
  { id: 'nm1', facility_name: 'Charlotte Maxeke Hospital', facility_type: 'public', province: 'Gauteng', onMera: false },
  { id: 'nm2', facility_name: 'Helen Joseph Hospital', facility_type: 'public', province: 'Gauteng', onMera: false },
  { id: 'nm3', facility_name: 'Sandton Clinic', facility_type: 'private', province: 'Gauteng', onMera: false },
];

export default function HospitalSelectionScreen() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selected, setSelected] = useState('');
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const data = await apiCall('/auth/hospitals/', 'GET', undefined, true);
        const list = Array.isArray(data) ? data : data.results || [];
        setHospitals(list);
      } catch (err) {
        console.log('Error fetching hospitals:', err);
        // Fall back to empty — user can still proceed
      } finally {
        setLoading(false);
      }
    };
    fetchHospitals();
  }, []);

  const allHospitals = [
  ...hospitals.map(h => ({ ...h, onMera: true })),
  ...NON_MERA_HOSPITALS,
];

const filtered = allHospitals.filter((h) => {
  const matchSearch = h.facility_name?.toLowerCase().includes(search.toLowerCase());
  const matchFilter =
    activeFilter === 'All' ||
    (activeFilter === 'On MERA' && h.onMera) ||
    (activeFilter === 'Public' && h.facility_type === 'public') ||
    (activeFilter === 'Private' && h.facility_type === 'private');
  return matchSearch && matchFilter;
});

  const selectedHospital = allHospitals.find((h) => h.id === selected);

  const handleSendRequest = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await apiCall('/verification/submit/', 'POST', {
        hospital_id: selected,
      }, true);

      Alert.alert(
        'Request Sent!',
        `Your verification request has been sent to ${selectedHospital?.facility_name}. You'll be notified once reviewed.`,
        [{ text: 'OK', onPress: () => router.push('/(patient)/patient-dashboard' as any) }]
      );
    } catch (err: any) {
      console.log('Verification submit error:', JSON.stringify(err));
      Alert.alert(
        'Request Failed',
        err.detail || 'Could not send verification request. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.container}>

        {/* FIXED TOP */}
        <View style={styles.fixedTop}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>←</Text>
            </TouchableOpacity>
            <View>
              <Text style={styles.headerTitle}>Select Hospital</Text>
              <Text style={styles.headerSub}>
                Step 2 of 3  •  Choose your verifying facility
              </Text>
            </View>
          </View>

          <View style={styles.progressRow}>
            {[1, 2, 3].map((i) => (
              <View
                key={i}
                style={[styles.progressSeg, i <= 2 && styles.progressActive]}
              />
            ))}
          </View>
        </View>

        {/* SCROLL CONTENT */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Search */}
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search hospitals, clinics..."
              placeholderTextColor={Colors.textSecondary}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
                onPress={() => setActiveFilter(f)}
              >
                <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.resultsLabel}>
            Results near you  •  Sorted by distance
          </Text>

          {/* Hospital List */}
          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : filtered.length === 0 ? (
            <Text style={{ color: Colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
              No hospitals found.
            </Text>
          ) : (
            filtered.map((h) => (
              <TouchableOpacity
                key={h.id}
                style={[
                  styles.hospitalCard,
                  selected === h.id && styles.hospitalCardSelected,
                ]}
                onPress={() => h.onMera && setSelected(h.id)}
              >
                <View style={[styles.hospitalIcon, h.onMera && styles.hospitalIconActive]}>
  <Text style={{ fontSize: 20 }}>🏥</Text>
</View>

<View style={styles.hospitalInfo}>
  <Text style={[styles.hospitalName, !h.onMera && styles.hospitalNameDim]}>
    {h.facility_name}
  </Text>
  <Text style={styles.hospitalSub}>
    {h.facility_type?.charAt(0).toUpperCase() + h.facility_type?.slice(1)}  •  {h.province || ''}
  </Text>
  <View style={[styles.meraBadge, !h.onMera && styles.meraBadgeOff]}>
    <Text style={[styles.meraBadgeText, !h.onMera && styles.meraBadgeTextOff]}>
      {h.onMera ? '✓  On MERA' : '✕  Not on MERA'}
    </Text>
  </View>
</View>

                {selected === h.id && (
                  <Text style={styles.selectedTick}>✓</Text>
                )}
              </TouchableOpacity>
            ))
          )}

          {/* Info Banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerTitle}>ℹ️ Don't see your hospital?</Text>
            <Text style={styles.infoBannerText}>
              Only MERA-registered hospitals are shown. If your hospital isn't listed, contact MERA support to get them onboarded.
            </Text>
          </View>

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendBtn, (!selected || submitting) && styles.sendBtnDisabled]}
            onPress={handleSendRequest}
            disabled={!selected || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#021208" />
            ) : (
              <Text style={styles.sendBtnText}>
                {selectedHospital
                  ? `Send Request to ${selectedHospital.facility_name}  →`
                  : 'Select a hospital to continue'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1 },
  fixedTop: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 100, backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 140, paddingHorizontal: Spacing.md, paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.md,
  },
  backBtn: { padding: Spacing.sm },
  backText: { color: Colors.textSecondary, fontSize: FontSizes.xl },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: '600' },
  headerSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
  progressRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  progressSeg: { flex: 1, height: 4, backgroundColor: '#1E2040', borderRadius: 2 },
  progressActive: { backgroundColor: Colors.primary },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0D0E1A', borderWidth: 1.5, borderColor: Colors.primary,
    borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md, height: 48, gap: Spacing.sm,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: FontSizes.sm },
  filterRow: { marginBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: '#0D0E1A', borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: '#2A2B40', marginRight: Spacing.sm,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  filterTextActive: { color: Colors.white, fontWeight: '600' },
  resultsLabel: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginBottom: Spacing.md },
  hospitalCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#11122A', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: '#2A2B40',
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.md,
  },
  hospitalCardSelected: { borderColor: Colors.primary, backgroundColor: '#0D1B3E' },
  hospitalIcon: {
    width: 44, height: 44, backgroundColor: '#1A1C30',
    borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center',
  },
  hospitalIconActive: { backgroundColor: '#0D2010' },
  hospitalInfo: { flex: 1 },
  hospitalName: { color: Colors.textPrimary, fontSize: FontSizes.sm, fontWeight: '600', marginBottom: 4 },
  hospitalSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginBottom: 6 },
  meraBadge: {
    alignSelf: 'flex-start', backgroundColor: '#0D2010',
    paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full,
  },
  meraBadgeText: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: '600' },
  selectedTick: { color: Colors.primary, fontSize: FontSizes.xl, fontWeight: '700' },
  infoBanner: {
    backgroundColor: '#0D1020', borderWidth: 1, borderColor: Colors.primary,
    borderRadius: BorderRadius.md, padding: Spacing.md, marginVertical: Spacing.md,
  },
  infoBannerTitle: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: '600', marginBottom: 6 },
  infoBannerText: { color: Colors.textSecondary, fontSize: FontSizes.xs, lineHeight: 18 },
  sendBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#021208', fontSize: FontSizes.md, fontWeight: '600' },

  hospitalCardDim: { opacity: 0.6 },
  hospitalNameDim: { color: Colors.textSecondary },
  meraBadgeOff: { backgroundColor: '#1A1A2A' },
  meraBadgeTextOff: { color: Colors.textSecondary },
});