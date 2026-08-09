import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

type Emergency = {
  id: string;
  triggered_at: string;
  status: string;
  priority_level: string;
  ambulance_service: string | null;
  destination_hospital: string | null;
  treatment_note: any | null;
};

export default function EmergencyHistoryScreen() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Emergency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await apiCall('/incidents/', 'GET', undefined, true);
        setHistory(Array.isArray(data) ? data : data.results || []);
      } catch (err) {
        console.log('Error fetching history:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      completed: 'Resolved',
      cancelled: 'Cancelled',
      active: 'In Progress',
      pending_confirmation: 'In Progress',
      dispatched: 'In Progress',
      on_the_way: 'In Progress',
      arrived_on_scene: 'In Progress',
    };
    return map[status] || status;
  };

  const isResolved = (status: string) =>
    status === 'completed' || status === 'cancelled';

  const resolved = history.filter((h) => isResolved(h.status)).length;
  const thisYear = history.filter((h) =>
    new Date(h.triggered_at).getFullYear() === new Date().getFullYear()
  ).length;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Emergency History</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Summary strip */}
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: Colors.primary }]}>
              {history.length}
            </Text>
            <Text style={styles.summaryLabel}>Total{'\n'}Emergencies</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: Colors.warning }]}>
              {thisYear}
            </Text>
            <Text style={styles.summaryLabel}>This{'\n'}Year</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryNum, { color: Colors.success }]}>
              {resolved}
            </Text>
            <Text style={styles.summaryLabel}>Fully{'\n'}Resolved</Text>
          </View>
        </View>

        {/* History list */}
        <Text style={styles.sectionLabel}>EMERGENCY LOG</Text>

        {history.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No emergency history yet</Text>
            <Text style={styles.emptySub}>
              Your past emergencies will appear here after you use the SOS feature.
            </Text>
          </View>
        ) : (
          history.map((h) => {
            const isExpanded = expanded === h.id;
            const resolved = isResolved(h.status);
            const statusLabel = getStatusLabel(h.status);

            // A non-terminal incident (anything except completed/cancelled)
            // has a live tracking screen worth reaching — tapping it
            // navigates there instead of expanding in place. This is one
            // of the only two paths (alongside the app-launch/login
            // session-restore redirect) into emergency-active.tsx for an
            // existing incident; see PROJECT_CONTEXT.md for why that
            // matters (a real dispatched incident was otherwise
            // unreachable once the auto-redirect didn't fire).
            const handlePress = () => {
              if (resolved) {
                setExpanded(isExpanded ? null : h.id);
              } else {
                router.push({
                  pathname: '/(patient)/emergency-active' as any,
                  params: { incidentId: h.id },
                });
              }
            };

            return (
              <TouchableOpacity
                key={h.id}
                style={styles.historyCard}
                onPress={handlePress}
                activeOpacity={0.85}
              >
                {/* Status badge */}
                <View style={[
                  styles.statusBadge,
                  resolved ? styles.statusBadgeResolved : styles.statusBadgePending,
                ]}>
                  <Text style={[
                    styles.statusBadgeText,
                    resolved ? styles.statusTextResolved : styles.statusTextPending,
                  ]}>
                    {statusLabel}
                  </Text>
                </View>

                <Text style={styles.historyDate}>{formatDate(h.triggered_at)}</Text>
                <Text style={styles.historyType}>
                  {h.priority_level
                    ? `${h.priority_level.charAt(0).toUpperCase() + h.priority_level.slice(1)} Priority Emergency`
                    : 'Emergency'}
                </Text>
                <Text style={styles.historyMeta}>
                  🚑  {h.ambulance_service || 'No ambulance assigned'}
                </Text>
                <Text style={styles.historyMeta}>
                  🏥  {h.destination_hospital || 'No hospital assigned'}
                </Text>

                <View style={styles.noteDivider} />

                <Text
                  style={styles.historyNotes}
                  numberOfLines={resolved && !isExpanded ? 2 : undefined}
                >
                  {h.treatment_note
                    ? h.treatment_note.chief_complaint || 'No treatment notes yet.'
                    : 'No treatment notes submitted yet.'}
                </Text>

                <Text style={styles.expandHint}>
                  {resolved
                    ? (isExpanded ? 'Tap to collapse ▲' : 'Tap to expand ▼')
                    : 'Tap to view live tracking →'}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={styles.footerNote}>
          Emergency records are stored securely and sent to your linked hospitals after each event.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1, paddingHorizontal: Spacing.md },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backText: { color: Colors.textSecondary, fontSize: FontSizes.xl },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: '700' },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: '#11122A',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#2A2B40',
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryNum: {
    fontSize: FontSizes.xxl,
    fontWeight: '700',
  },
  summaryLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#2A2B40',
    marginHorizontal: Spacing.sm,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  emptySub: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  historyCard: {
    backgroundColor: '#11122A',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#2A2B40',
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statusBadge: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  statusBadgeResolved: { backgroundColor: '#0A2010' },
  statusBadgePending: { backgroundColor: '#2A1F00' },
  statusBadgeText: { fontSize: FontSizes.xs, fontWeight: '600' },
  statusTextResolved: { color: Colors.success },
  statusTextPending: { color: Colors.warning },
  historyDate: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginBottom: 4,
  },
  historyType: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  historyMeta: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 20,
  },
  noteDivider: {
    height: 1,
    backgroundColor: '#2A2B40',
    marginVertical: Spacing.sm,
  },
  historyNotes: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  expandHint: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    textAlign: 'right',
  },
  footerNote: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
});