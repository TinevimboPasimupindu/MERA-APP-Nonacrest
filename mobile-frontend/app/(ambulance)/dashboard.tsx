import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { Colors, Spacing } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

export default function AmbulanceDashboard() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({ today: 0, responseRate: 0 });

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  const fetchAlerts = useCallback(async () => {
    try {
      console.log('Fetching alerts...');
      const alertsData = await apiCall('/incidents/active_alerts/', 'GET', undefined, true);
      console.log('Alerts data:', JSON.stringify(alertsData));

      const alertsRaw = alertsData as any;
      const alertsList = Array.isArray(alertsRaw)
        ? alertsRaw
        : alertsRaw?.results
        ? alertsRaw.results
        : alertsRaw?.id
        ? [alertsRaw]
        : [];

      console.log('Alerts list length:', alertsList.length);
      setAlerts(alertsList);

      const userData = await apiCall(ENDPOINTS.me, 'GET', undefined, true);
      setUser(userData);

      // Fetch completed incidents for stats
      const historyData = await apiCall('/incidents/my_responses/', 'GET', undefined, true);      const historyList = Array.isArray(historyData) ? historyData : historyData.results || [];
      const today = new Date().toDateString();
      const todayCount = historyList.filter((i: any) =>
        new Date(i.triggered_at).toDateString() === today
      ).length;
      const completedCount = historyList.filter((i: any) => i.status === 'completed').length;
      const responseRate = historyList.length > 0
        ? Math.round((completedCount / historyList.length) * 100)
        : 0;
        setStats({ today: todayCount, responseRate });

    } catch (err: any) {
      console.log('Error fetching alerts:', JSON.stringify(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleAccept = async (incidentId: string) => {
    setAccepting(incidentId);
    try {
      await apiCall(`/incidents/${incidentId}/accept/`, 'POST', {}, true);
      router.push({
        pathname: '/(ambulance)/active-response' as any,
        params: { incidentId },
      });
    } catch (err: any) {
      console.log('Accept error:', JSON.stringify(err));
      alert(err.detail || 'Could not accept alert. It may have already been taken.');
      fetchAlerts();
    } finally {
      setAccepting(null);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const formatTimeAgo = (dateString: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  if (!fontsLoaded) return null;

  return (
    <View style={styles.screen}>

      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <View style={styles.topRow}>
          
          <View style={styles.titleBlock}>
            <Text style={styles.serviceName}>
              {user?.display_name || 'Ambulance Service'}
            </Text>
            <Text style={styles.serviceSubtitle}>Dispatch Dashboard</Text>
          </View>

          <View style={styles.availableBadge}>
            <View style={styles.greenDot} />
            <Text style={styles.availableText}>Available</Text>
          </View>
        </View>

        <View style={styles.headerDivider} />

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumberRed}>{alerts.length}</Text>
            <Text style={styles.statLabel}>Active Alerts</Text>
          </View>

          <View style={styles.statCard}>
             <Text style={styles.statNumberAmber}>{stats.today}</Text>
             <Text style={styles.statLabel}>Today</Text>
          </View>


          <View style={styles.statCard}>
          <Text style={styles.statNumberGreen}>{stats.responseRate}%</Text>
          <Text style={styles.statLabel}>Response</Text>
          </View>

        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>INCOMING ALERTS</Text>
          <View style={styles.liveBadge}>
            <View style={styles.redDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : alerts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyText}>No active alerts</Text>
            <Text style={styles.emptySub}>Pull down to refresh</Text>
          </View>
        ) : (
          alerts.map((alert) => (
            <View key={alert.id} style={styles.criticalCard}>
              <View style={styles.criticalBadge}>
                <Text style={styles.criticalBadgeText}>
                  {alert.priority_level?.toUpperCase() || 'HIGH'}
                </Text>
              </View>
              <View style={styles.alertRow}>
                <View style={styles.alertInfo}>
                  <Text style={styles.alertName}>
                    {alert.patient_display_name || 'Patient'}
                  </Text>
                  <Text style={styles.alertCondition}>Emergency Alert</Text>
                  <Text style={styles.alertDistance}>
                    🕐 {formatTimeAgo(alert.triggered_at)}
                  </Text>
                  <Text style={styles.alertDistance}>
                    📍 {alert.latitude
                      ? `${parseFloat(alert.latitude).toFixed(4)}, ${parseFloat(alert.longitude).toFixed(4)}`
                      : 'Location shared'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.acceptButtonRed, accepting === alert.id && { opacity: 0.6 }]}
                  onPress={() => handleAccept(alert.id)}
                  disabled={accepting === alert.id}
                >
                  {accepting === alert.id ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <TouchableOpacity
          style={styles.logButton}
          onPress={() => router.push('/(ambulance)/ambulance-history' as any)}
>
          <Text style={styles.logButtonText}>View Emergency Log History</Text>
          <Text style={styles.logChevron}>›</Text>
          </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  stickyHeader: {
    backgroundColor: Colors.background,
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 16,
    zIndex: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backArrow: {
    color: Colors.textSecondary,
    fontSize: 22,
  },
  titleBlock: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  serviceName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.textPrimary,
  },
  serviceSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  availableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D2E1A',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.success,
  },
  availableText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.success,
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#1A1D35',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1D35',
    borderRadius: 14,
    padding: 16,
    alignItems: 'flex-start',
  },
  statNumberRed: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: Colors.emergency,
  },
  statNumberAmber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: Colors.warning,
  },
  statNumberGreen: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: Colors.success,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 80,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 2,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.emergency,
  },
  liveText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Colors.emergency,
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
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
  },
  criticalCard: {
    backgroundColor: '#2A0A0A',
    borderWidth: 2,
    borderColor: Colors.emergency,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  criticalBadge: {
    backgroundColor: '#3D0000',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  criticalBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.emergency,
    letterSpacing: 1,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertInfo: {
    flex: 1,
    marginRight: 12,
  },
  alertName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  alertCondition: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  alertDistance: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  acceptButtonRed: {
    backgroundColor: Colors.emergency,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 80,
  },
  acceptButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.white,
  },
  logButton: {
    backgroundColor: '#1A1D35',
    borderRadius: 14,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  logButtonText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.primary,
  },
  logChevron: {
    color: Colors.primary,
    fontSize: 20,
  },
});