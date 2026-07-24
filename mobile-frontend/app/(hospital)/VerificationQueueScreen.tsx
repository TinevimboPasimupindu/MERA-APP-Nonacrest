import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiCall } from '../../services/api';

type TabKey = 'pending' | 'approved' | 'flagged';
type BadgeStatus = 'NEW' | 'WAITING' | 'APPROVED' | 'FLAGGED';

const StatusBadge: React.FC<{ status: BadgeStatus }> = ({ status }) => {
  const config: Record<BadgeStatus, { bg: string; text: string; label: string }> = {
    NEW:      { bg: '#1D4ED8', text: '#93C5FD', label: 'NEW' },
    WAITING:  { bg: '#92400E', text: '#FCD34D', label: 'WAITING' },
    APPROVED: { bg: '#065F46', text: '#6EE7B7', label: 'APPROVED' },
    FLAGGED:  { bg: '#7F1D1D', text: '#FCA5A5', label: 'FLAGGED' },
  };
  const c = config[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
};

const PatientRow: React.FC<{
  patient: any;
  onReview: (id: string) => void;
}> = ({ patient, onReview }) => {
  const name = patient.patient_name || 'Unknown Patient';
  const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  const getStatus = (): BadgeStatus => {
    if (patient.urgency_badge === 'OVERDUE') return 'WAITING';
    if (patient.status === 'approved') return 'APPROVED';
    if (patient.status === 'flagged') return 'FLAGGED';
    return 'NEW';
  };

  const formatTime = (dateString: string) => {
    const hours = Math.floor((Date.now() - new Date(dateString).getTime()) / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours} hours ago`;
    return `${Math.floor(hours / 24)} days ago`;
  };

  return (
    <View style={styles.patientRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.rowInfo}>
        <View style={styles.rowTopLine}>
          <Text style={styles.patientName}>{name}</Text>
          <StatusBadge status={getStatus()} />
        </View>
        <Text style={styles.patientMeta}>
          {patient.urgency_badge || '—'}
        </Text>
        <View style={styles.rowBottomLine}>
          <Text style={styles.submittedLabel}>
            Submitted: {formatTime(patient.submitted_at)}
          </Text>
          <TouchableOpacity onPress={() => onReview(patient.id)}>
            <Text style={styles.reviewLink}>Review →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const TabBar: React.FC<{
  active: TabKey;
  counts: { pending: number; approved: number; flagged: number };
  onChange: (tab: TabKey) => void;
}> = ({ active, counts, onChange }) => {
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'pending',  label: `Pending (${counts.pending})` },
    { key: 'approved', label: 'Approved' },
    { key: 'flagged',  label: 'Flagged' },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, active === tab.key && styles.tabActive]}
          onPress={() => onChange(tab.key)}
        >
          <Text style={[styles.tabText, active === tab.key && styles.tabTextActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const VerificationQueueScreen: React.FC = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [queue, setQueue] = useState<any[]>([]);
  const [approvedList, setApprovedList] = useState<any[]>([]);
  const [flaggedList, setFlaggedList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

 const fetchQueue = useCallback(async () => {
    try {
      const [queueData, approvedData, flaggedData, userData] = await Promise.all([
        apiCall('/verification/queue/', 'GET', undefined, true),
        apiCall('/verification/approved/', 'GET', undefined, true),
        apiCall('/verification/flagged/', 'GET', undefined, true),
        apiCall('/auth/me/', 'GET', undefined, true),
      ]);
      const pending = Array.isArray(queueData) ? queueData : queueData.results || [];
      const approved = Array.isArray(approvedData) ? approvedData : approvedData.results || [];
      const flagged = Array.isArray(flaggedData) ? flaggedData : flaggedData.results || [];
      setQueue(pending);
      setApprovedList(approved);
      setFlaggedList(flagged);
      setUser(userData);
    } catch (err) {
      console.log('Error fetching queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleReview = (id: string): void => {
    router.push(`/(hospital)/VerifyPatientScreen?requestId=${id}` as any);
  };

  const pendingCount = queue.length;
  const stats = { pending: queue.length, approved: approvedList.length, flagged: flaggedList.length };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.headerBg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Verification Queue</Text>
          <Text style={styles.headerSubtitle}>
            {user?.display_name || 'Hospital'}  •  Your Queue
          </Text>
        </View>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>{pendingCount} Pending</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <TabBar active={activeTab} counts={stats} onChange={setActiveTab} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
       {loading ? (
          <ActivityIndicator color="#4ADE80" size="large" style={{ marginTop: 40 }} />
        ) : activeTab === 'pending' && queue.length > 0 ? (
          queue.map((p) => (
            <PatientRow key={p.id} patient={p} onReview={handleReview} />
          ))
        ) : activeTab === 'approved' && approvedList.length > 0 ? (
          approvedList.map((p) => (
            <PatientRow key={p.id} patient={p} onReview={handleReview} />
          ))
        ) : activeTab === 'flagged' && flaggedList.length > 0 ? (
          flaggedList.map((p) => (
            <PatientRow key={p.id} patient={p} onReview={handleReview} />
          ))
        ) : (
          <Text style={styles.emptyText}>No {activeTab} submissions.</Text>
        )}

        <View style={styles.slaBanner}>
          <Text style={styles.slaTitle}>📋  Verification SLA</Text>
          <Text style={styles.slaBody}>
            Patients must be reviewed within 48 hours of submission. Overdue reviews are escalated.
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={[styles.statValue, { color: Colors.statPending }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statValue, { color: Colors.statApproved }]}>{stats.approved}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statValue, { color: Colors.statFlagged }]}>{stats.flagged}</Text>
            <Text style={styles.statLabel}>Flagged</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default VerificationQueueScreen;

const Colors = {
  background:      '#0A0E1A',
  headerBg:        '#0D1F0D',
  headerBorder:    '#1A3A1A',
  surface:         '#111827',
  cardBg:          '#0F172A',
  cardBorder:      '#1E293B',
  tabActiveBorder: '#4ADE80',
  tabActiveText:   '#4ADE80',
  tabInactiveText: '#94A3B8',
  reviewLink:      '#4ADE80',
  pendingBadgeBg:  '#DC2626',
  slaBannerBg:     '#0D2B1A',
  slaBannerBorder: '#16A34A',
  statPending:     '#94A3B8',
  statApproved:    '#4ADE80',
  statFlagged:     '#EF4444',
  textPrimary:     '#FFFFFF',
  textSecondary:   '#94A3B8',
  textMuted:       '#64748B',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    backgroundColor:   Colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.headerBorder,
  },
  backButton:  { marginRight: 8, padding: 4 },
  backArrow:   { color: Colors.textPrimary, fontSize: 20 },
  headerCenter:    { flex: 1, alignItems: 'center' },
  headerTitle:     { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  headerSubtitle:  { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  pendingBadge: {
    backgroundColor:   Colors.pendingBadgeBg,
    borderRadius:      20,
    paddingHorizontal: 10,
    paddingVertical:   5,
  },
  pendingBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  tabBar: {
    flexDirection:     'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    backgroundColor:   Colors.background,
  },
  tab: {
    flex:              1,
    paddingVertical:   13,
    alignItems:        'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive:     { borderBottomColor: Colors.tabActiveBorder },
  tabText:       { color: Colors.tabInactiveText, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.tabActiveText, fontWeight: '700' },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  patientRow: {
    flexDirection:   'row',
    backgroundColor: Colors.cardBg,
    borderWidth:     1,
    borderColor:     Colors.cardBorder,
    borderRadius:    12,
    padding:         14,
    marginBottom:    10,
    gap:             12,
    alignItems:      'flex-start',
  },
  avatar: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: '#1D4ED8',
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarText:     { color: '#FFF', fontSize: 15, fontWeight: '700' },
  rowInfo:        { flex: 1 },
  rowTopLine:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  patientName:    { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  patientMeta:    { color: Colors.textSecondary, fontSize: 12, marginBottom: 6 },
  rowBottomLine:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  submittedLabel: { color: Colors.textMuted, fontSize: 12 },
  reviewLink:     { color: Colors.reviewLink, fontSize: 13, fontWeight: '600' },
  badge:     { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  emptyText: { color: Colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },
  slaBanner: {
    backgroundColor: Colors.slaBannerBg,
    borderWidth:     1.5,
    borderColor:     Colors.slaBannerBorder,
    borderRadius:    12,
    padding:         14,
    marginTop:       8,
    marginBottom:    16,
  },
  slaTitle: { color: '#4ADE80', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  slaBody:  { color: Colors.textSecondary, fontSize: 13, lineHeight: 19 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statTile: {
    flex:            1,
    backgroundColor: Colors.cardBg,
    borderWidth:     1,
    borderColor:     Colors.cardBorder,
    borderRadius:    12,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statValue: { fontSize: 28, fontWeight: '800', lineHeight: 32 },
  statLabel: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
});