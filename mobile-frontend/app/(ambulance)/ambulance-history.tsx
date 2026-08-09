import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { Colors, Spacing } from '../../constants/theme';
import { apiCall } from '../../services/api';

export default function AmbulanceHistory() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await apiCall('/incidents/my_responses/', 'GET', undefined, true);
        const list = Array.isArray(data) ? data : data.results || [];
        setIncidents(list);
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
    return new Date(dateString).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return Colors.success;
    if (status === 'cancelled') return Colors.textSecondary;
    return Colors.warning;
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      completed: 'Completed',
      cancelled: 'Cancelled',
      dispatched: 'Dispatched',
      on_the_way: 'On the Way',
      arrived_on_scene: 'Arrived',
      active: 'Active',
    };
    return map[status] || status;
  };

  const isResolved = (status: string) =>
    status === 'completed' || status === 'cancelled';

  if (!fontsLoaded) return null;

  return (
    <View style={styles.screen}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Emergency Log</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Summary Strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: Colors.primary }]}>
            {incidents.length}
          </Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: Colors.success }]}>
            {incidents.filter(i => i.status === 'completed').length}
          </Text>
          <Text style={styles.summaryLabel}>Completed</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: Colors.warning }]}>
            {incidents.filter(i => i.status !== 'completed' && i.status !== 'cancelled').length}
          </Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
      </View>

      {/* List */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : incidents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No emergency history yet</Text>
          </View>
        ) : (
          incidents.map((incident) => {
            const resolved = isResolved(incident.status);
            const isExpanded = expanded === incident.id;

            // Same reasoning as emergency-history.tsx on the patient side:
            // a non-terminal incident is tappable straight into its live
            // tracking screen (active-response.tsx) — this, plus the
            // app-launch/login session-restore redirect, are the only two
            // ways to reach that screen for an existing incident. Terminal
            // incidents have nothing live to show, so they keep expanding
            // in place instead, same as the patient side.
            const handlePress = () => {
              if (resolved) {
                setExpanded(isExpanded ? null : incident.id);
              } else {
                router.push({
                  pathname: '/(ambulance)/active-response' as any,
                  params: { incidentId: incident.id },
                });
              }
            };

            return (
              <TouchableOpacity
                key={incident.id}
                style={styles.incidentCard}
                onPress={handlePress}
                activeOpacity={0.85}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.incidentDate}>
                    {formatDate(incident.triggered_at)}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(incident.status) + '22' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(incident.status) }]}>
                      {getStatusLabel(incident.status)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.incidentPriority}>
                  {incident.priority_level?.toUpperCase() || 'HIGH'} Priority Emergency
                </Text>

                <Text style={styles.incidentMeta}>
                  📍 {incident.latitude
                    ? `${parseFloat(incident.latitude).toFixed(4)}, ${parseFloat(incident.longitude).toFixed(4)}`
                    : 'Location not available'}
                </Text>

                {incident.destination_hospital && (
                  <Text style={styles.incidentMeta}>
                    🏥 Transported to hospital
                  </Text>
                )}

                {incident.treatment_note && (
                  <View style={styles.notesCard}>
                    <Text style={styles.notesLabel}>TREATMENT NOTES</Text>
                    <Text
                      style={styles.notesText}
                      numberOfLines={resolved && !isExpanded ? 2 : undefined}
                    >
                      {incident.treatment_note.chief_complaint || 'No notes submitted'}
                    </Text>
                  </View>
                )}

                <Text style={styles.expandHint}>
                  {resolved
                    ? (isExpanded ? 'Tap to collapse ▲' : 'Tap to expand ▼')
                    : 'Tap to view live response →'}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 16,
    backgroundColor: Colors.background,
  },
  backArrow: {
    color: Colors.textSecondary,
    fontSize: 22,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.textPrimary,
  },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: '#1A1D35',
    marginHorizontal: Spacing.lg,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
  },
  summaryLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#2A2D45',
  },
  scroll: { flex: 1 },
  container: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 80,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.textPrimary,
  },
  incidentCard: {
    backgroundColor: '#1A1D35',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2D45',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  incidentDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  incidentPriority: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  incidentMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  notesCard: {
    backgroundColor: '#0D0E1A',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  notesLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  notesText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  expandHint: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.primary,
    textAlign: 'right',
    marginTop: 10,
  },
});