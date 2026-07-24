import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiCall, ENDPOINTS } from '../../services/api';

type PatientPriority = 'urgent' | 'warning';

interface IncomingPatient {
  id:        string;
  name:      string;
  meta:      string;
  ambulance: string;
  eta:       number;
  priority:  PatientPriority;
}

const theme = {
  colors: {
    bg:              '#0B0F1A',
    surface:         '#131929',
    surfaceBorder:   '#1E2A3A',
    onMeraBg:        '#0E2010',
    onMeraText:      '#4CAF50',
    onMeraDot:       '#4CAF50',
    verifyBg:        '#0A1F0A',
    verifyBorder:    '#1A5C1A',
    verifyArrow:     '#4CAF50',
    verifyBadgeBg:   '#7B3F00',
    verifyBadgeText: '#FF9800',
    updateBg:        '#0A0F1F',
    updateBorder:    '#1A2A5C',
    updateArrow:     '#4A90E2',
    updateBadgeBg:   '#0A1929',
    updateBadgeText: '#4A90E2',
    urgentBg:        '#1F0A0A',
    urgentBorder:    '#8B0000',
    urgentEta:       '#FF6B6B',
    warningBg:       '#1F1200',
    warningBorder:   '#7B4A00',
    warningEta:      '#FFA500',
    viewDetailsBg:   '#1E2A3A',
    viewDetailsText: '#4A90E2',
    liveDot:         '#FF3D3D',
    liveText:        '#FF3D3D',
    statRedText:     '#FF4444',
    statAmberText:   '#FFA500',
    statGreenText:   '#4CAF50',
    textPrimary:     '#E6EDF3',
    textSecondary:   '#8B949E',
    textMuted:       '#6B7A8D',
    textLabel:       '#6B7A8D',
  },
  spacing: { xs: 4, sm: 8, md: 14, lg: 20, xl: 28 },
  radius:  { sm: 6, md: 10, lg: 14, full: 999 },
  font:    { xs: 11, sm: 12, base: 14, md: 16, lg: 18, xl: 22 },
};

const LiveDot: React.FC = () => {
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return <Animated.View style={[styles.liveDot, { opacity: anim }]} />;
};

export default function HospitalPortal(): React.JSX.Element {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [incomingPatients, setIncomingPatients] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [patientCount, setPatientCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [userData, incomingData] = await Promise.all([
        apiCall(ENDPOINTS.me, 'GET', undefined, true),
        apiCall('/incidents/incoming_patients/', 'GET', undefined, true),
      ]);

      setUser(userData);

      const incoming = Array.isArray(incomingData) ? incomingData : incomingData.results || [];
      setIncomingPatients(incoming);
      setPendingCount(incoming.length);

    } catch (err) {
      console.log('Error fetching hospital data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleViewDetails = (incidentId: string): void => {
    router.push(`/(hospital)/IncomingPatientScreen?incidentId=${incidentId}` as any);
  };

  const handleVerifyRecords = (): void => {
    router.push('/(hospital)/VerificationQueueScreen' as any);
  };

  const handleUpdateRecords = (): void => {
    router.push('/(hospital)/UpdateRecords' as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.hospitalIconBox}>
          <Text style={styles.hospitalIcon}>🏥</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.hospitalName}>
            {user?.display_name || 'Hospital Portal'}
          </Text>
          <Text style={styles.hospitalSub}>Hospital Portal • MERA</Text>
        </View>
        <View style={styles.onMeraBadge}>
          <View style={styles.onMeraDot} />
          <Text style={styles.onMeraText}>On MERA</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.prompt}>What would you like to do?</Text>

        {/* Verify Records */}
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: theme.colors.verifyBg, borderColor: theme.colors.verifyBorder }]}
          onPress={handleVerifyRecords}
          activeOpacity={0.85}
        >
          <View style={styles.actionCardTop}>
            <Text style={styles.actionIcon}>✅</Text>
            <Text style={[styles.actionArrow, { color: theme.colors.verifyArrow }]}>→</Text>
          </View>
          <Text style={styles.actionTitle}>Verify Records</Text>
          <Text style={styles.actionSubtitle}>Review patient medical submissions</Text>
          <View style={[styles.actionBadge, { backgroundColor: theme.colors.verifyBadgeBg }]}>
            <Text style={[styles.actionBadgeText, { color: theme.colors.verifyBadgeText }]}>
              Verification Queue
            </Text>
          </View>
        </TouchableOpacity>

        {/* Update Records */}
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: theme.colors.updateBg, borderColor: theme.colors.updateBorder }]}
          onPress={handleUpdateRecords}
          activeOpacity={0.85}
        >
          <View style={styles.actionCardTop}>
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={[styles.actionArrow, { color: theme.colors.updateArrow }]}>→</Text>
          </View>
          <Text style={styles.actionTitle}>Update Records</Text>
          <Text style={styles.actionSubtitle}>View and edit verified patient records</Text>
          <View style={[styles.actionBadge, { backgroundColor: theme.colors.updateBadgeBg }]}>
            <Text style={[styles.actionBadgeText, { color: theme.colors.updateBadgeText }]}>
              Patient Records
            </Text>
          </View>
        </TouchableOpacity>

        {/* Incoming Patients */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>INCOMING PATIENTS</Text>
          <View style={styles.liveChip}>
            <LiveDot />
            <Text style={styles.liveChipText}>LIVE</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#4A90E2" style={{ marginVertical: 20 }} />
        ) : incomingPatients.length === 0 ? (
          <View style={styles.emptyIncoming}>
            <Text style={styles.emptyIncomingText}>No incoming patients</Text>
          </View>
        ) : (
          incomingPatients.map((incident: any) => (
            <View
              key={incident.id}
              style={[styles.incomingCard, styles.incomingCardUrgent]}
            >
              <Text style={[styles.etaText, { color: theme.colors.urgentEta }]}>
                ETA  {incident.eta_minutes || '—'} min
              </Text>
              <View style={styles.incomingCardBody}>
                <View style={styles.incomingInfo}>
                  <Text style={styles.incomingName}>
                    {incident.patient_summary?.full_name || 'Patient'}
                  </Text>
                  <Text style={styles.incomingMeta}>
                    {incident.patient_summary?.chronic_conditions || 'No conditions listed'}
                  </Text>
                  <View style={styles.incomingAmbRow}>
                    <Text style={styles.ambIcon}>🚑</Text>
                    <Text style={styles.ambText}>
                      {incident.ambulance_name || 'Ambulance en route'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.viewDetailsBtn}
                  onPress={() => handleViewDetails(incident.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.viewDetailsBtnText}>View{'\n'}Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Stats */}
        <Text style={styles.sectionLabel}>TODAY'S OVERVIEW</Text>
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={[styles.statValue, { color: theme.colors.statAmberText }]}>
              {incomingPatients.length}
            </Text>
            <Text style={styles.statLabel}>Incoming</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statValue, { color: theme.colors.statGreenText }]}>
              —
            </Text>
            <Text style={styles.statLabel}>Patients</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom:     theme.spacing.xl,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical:   theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surfaceBorder,
    gap:               theme.spacing.sm,
  },
  hospitalIconBox: {
    width:           38,
    height:          38,
    borderRadius:    6,
    backgroundColor: '#1A3A1A',
    alignItems:      'center',
    justifyContent:  'center',
  },
  hospitalIcon: { fontSize: 20 },
  headerText:   { flex: 1 },
  hospitalName: {
    fontSize:   theme.font.base,
    fontWeight: '700',
    color:      theme.colors.textPrimary,
  },
  hospitalSub: {
    fontSize:  theme.font.xs,
    color:     theme.colors.textSecondary,
    marginTop: 1,
  },
  onMeraBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   theme.colors.onMeraBg,
    borderRadius:      999,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical:   4,
    borderWidth:       1,
    borderColor:       '#1A5C1A',
  },
  onMeraDot: {
    width:           6,
    height:          6,
    borderRadius:    999,
    backgroundColor: theme.colors.onMeraDot,
  },
  onMeraText: {
    fontSize:   theme.font.xs,
    fontWeight: '700',
    color:      theme.colors.onMeraText,
  },
  prompt: {
    fontSize:     theme.font.base,
    color:        theme.colors.textSecondary,
    marginTop:    theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  actionCard: {
    borderWidth:  1.5,
    borderRadius: theme.radius.md,
    padding:      theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  actionCardTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   theme.spacing.xs,
  },
  actionIcon:  { fontSize: 24 },
  actionArrow: { fontSize: theme.font.xl, fontWeight: '300' },
  actionTitle: {
    fontSize:     theme.font.lg,
    fontWeight:   '700',
    color:        theme.colors.textPrimary,
    marginBottom: 3,
  },
  actionSubtitle: {
    fontSize:     theme.font.sm,
    color:        theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  actionBadge: {
    alignSelf:         'flex-start',
    borderRadius:      999,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical:   3,
  },
  actionBadgeText: { fontSize: theme.font.xs, fontWeight: '700' },
  sectionHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      theme.spacing.md,
    marginBottom:   theme.spacing.sm,
  },
  sectionLabel: {
    fontSize:      theme.font.xs,
    fontWeight:    '700',
    color:         theme.colors.textLabel,
    letterSpacing: 1,
    marginTop:     theme.spacing.md,
    marginBottom:  theme.spacing.sm,
  },
  liveChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    backgroundColor:   '#2D0A0A',
    borderRadius:      999,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical:   3,
    borderWidth:       1,
    borderColor:       theme.colors.liveDot + '55',
  },
  liveDot: {
    width:           6,
    height:          6,
    borderRadius:    999,
    backgroundColor: theme.colors.liveDot,
  },
  liveChipText: {
    fontSize:      theme.font.xs,
    fontWeight:    '700',
    color:         theme.colors.liveText,
    letterSpacing: 0.8,
  },
  emptyIncoming: {
    backgroundColor: theme.colors.surface,
    borderRadius:    theme.radius.md,
    padding:         theme.spacing.lg,
    alignItems:      'center',
    marginBottom:    theme.spacing.sm,
  },
  emptyIncomingText: {
    fontSize: theme.font.sm,
    color:    theme.colors.textSecondary,
  },
  incomingCard: {
    borderWidth:  1.5,
    borderRadius: theme.radius.md,
    padding:      theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  incomingCardUrgent:  { backgroundColor: theme.colors.urgentBg,  borderColor: theme.colors.urgentBorder },
  incomingCardWarning: { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warningBorder },
  etaText: {
    fontSize:      theme.font.xs,
    fontWeight:    '700',
    marginBottom:  theme.spacing.sm,
    letterSpacing: 0.5,
  },
  incomingCardBody: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  incomingInfo:     { flex: 1 },
  incomingName: {
    fontSize:     theme.font.md,
    fontWeight:   '700',
    color:        theme.colors.textPrimary,
    marginBottom: 3,
  },
  incomingMeta:   { fontSize: theme.font.sm, color: theme.colors.textSecondary, marginBottom: 4 },
  incomingAmbRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ambIcon:        { fontSize: 12 },
  ambText:        { fontSize: theme.font.xs, color: theme.colors.textMuted },
  viewDetailsBtn: {
    backgroundColor:   theme.colors.viewDetailsBg,
    borderRadius:      theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical:   theme.spacing.sm,
    alignItems:        'center',
    minWidth:          72,
  },
  viewDetailsBtnText: {
    fontSize:   theme.font.sm,
    fontWeight: '700',
    color:      theme.colors.viewDetailsText,
    textAlign:  'center',
    lineHeight: 18,
  },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  statTile: {
    flex:            1,
    backgroundColor: theme.colors.surface,
    borderRadius:    theme.radius.md,
    padding:         theme.spacing.md,
    alignItems:      'flex-start',
    borderWidth:     1,
    borderColor:     theme.colors.surfaceBorder,
  },
  statValue: { fontSize: theme.font.xl + 4, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: theme.font.xs, color: theme.colors.textSecondary },
});