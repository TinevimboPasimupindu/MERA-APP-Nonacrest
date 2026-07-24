import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

const PATIENT_LOCATION = {
  latitude: -26.2041,
  longitude: 28.0473,
};

const AMBULANCE_LOCATION = {
  latitude: -26.1929,
  longitude: 28.0305,
};

export default function EmergencyActiveScreen() {
  const { incidentId } = useLocalSearchParams<{ incidentId: string }>();
  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Poll for incident updates every 10 seconds
  useEffect(() => {
    if (!incidentId) return;

    const fetchIncident = async () => {
      try {
        const data = await apiCall(
          typeof ENDPOINTS.getIncident === 'function'
            ? ENDPOINTS.getIncident(incidentId)
            : ENDPOINTS.getIncident,
          'GET',
          undefined,
          true
        );
        setIncident(data);

        // Navigate away if emergency is completed or cancelled
        if (data.status === 'completed' || data.status === 'cancelled') {
          router.replace('/(patient)/patient-dashboard' as any);
        }

      } catch (err) {
        console.log('Error fetching incident:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchIncident();
    const interval = setInterval(fetchIncident, 10000);
    return () => clearInterval(interval);
  }, [incidentId]);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Emergency?',
      'Are you sure you want to cancel? This will notify the ambulance and hospital.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Cancel Emergency',
          style: 'destructive',
          onPress: async () => {
            try {
              if (incidentId) {
                await apiCall(
                  typeof ENDPOINTS.cancelIncident === 'function'
                    ? ENDPOINTS.cancelIncident(incidentId)
                    : ENDPOINTS.cancelIncident,
                  'POST',
                  { reason: 'Patient cancelled' },
                  true
                );
              }
            } catch (err) {
              console.log('Cancel error:', err);
            }
            router.replace('/(patient)/patient-dashboard' as any);
          },
        },
      ]
    );
  };

  const getStatusSteps = () => {
    if (!incident) return [
      { icon: '🚨', label: 'SOS Triggered', sub: 'Waiting for ambulance...', color: Colors.warning },
    ];

    const steps = [
      { icon: '🚨', label: 'SOS Triggered', sub: 'Completed', color: Colors.success },
    ];

    if (incident.ambulance_service) {
      steps.push({
        icon: '🚑',
        label: 'Ambulance Dispatched',
        sub: incident.eta_minutes ? `ETA ${incident.eta_minutes} min` : 'En route',
        color: Colors.warning,
      });
    }

    if (incident.destination_hospital) {
      steps.push({
        icon: '🏥',
        label: 'Hospital Notified',
        sub: 'Hospital preparing',
        color: Colors.success,
      });
    }

    steps.push({
      icon: '📞',
      label: 'Emergency contacts notified',
      sub: 'SMS sent',
      color: Colors.success,
    });

    return steps;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#330808" />
      <LinearGradient
        colors={['#330808', '#991717']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.appName}>MERA</Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>🚨 ACTIVE</Text>
            </View>
          </View>

          {/* Title */}
          <View style={styles.titleArea}>
            <Text style={styles.emergencyTitle}>EMERGENCY{'\n'}ACTIVATED</Text>
          </View>

          {/* Dispatch Card */}
          <View style={styles.dispatchCard}>
            <Text style={styles.dispatchHeading}>🚑  Ambulance Assigned</Text>
            <Text style={styles.dispatchName}>
              {incident?.ambulance_service ?? 'Searching for ambulance...'}
            </Text>
            <Text style={styles.dispatchEta}>
              {incident?.eta_minutes
                ? `ETA  ${incident.eta_minutes} minutes`
                : 'Calculating ETA...'}
            </Text>
            <Text style={styles.dispatchHospital}>
              🏥  {incident?.destination_hospital
                ? `Destination: ${incident.destination_hospital}`
                : 'Hospital not yet assigned'}
            </Text>
            <Text style={styles.dispatchLocation}>📍  Your location has been shared</Text>
          </View>

          {/* Map */}
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: -26.1985,
              longitude: 28.0389,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
          >
            <Marker coordinate={PATIENT_LOCATION} title="Patient" pinColor="red" />
            <Marker coordinate={AMBULANCE_LOCATION} title="Ambulance" pinColor="blue" />
            <Polyline
              coordinates={[AMBULANCE_LOCATION, PATIENT_LOCATION]}
              strokeColor={Colors.primary}
              strokeWidth={4}
            />
          </MapView>

          {/* Status Steps */}
          <View style={styles.stepsContainer}>
            {getStatusSteps().map((s, i) => (
              <View key={i} style={styles.stepCard}>
                <Text style={styles.stepIcon}>{s.icon}</Text>
                <View style={styles.stepContent}>
                  <Text style={styles.stepLabel}>{s.label}</Text>
                  <Text style={styles.stepSub}>{s.sub}</Text>
                </View>
                <View style={[styles.stepDot, { backgroundColor: s.color }]} />
              </View>
            ))}
          </View>

          {/* Cancel Button */}
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
            <Text style={styles.cancelBtnText}>Cancel Emergency</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>Stay calm. Help is on the way.</Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#991717',
  },
  gradient: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: FontSizes.xl,
    fontWeight: '700',
  },
  activeBadge: {
    backgroundColor: Colors.emergency,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  activeBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  titleArea: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  emergencyTitle: {
    color: Colors.textPrimary,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 44,
  },
  dispatchCard: {
    backgroundColor: '#200808',
    borderWidth: 1.5,
    borderColor: Colors.emergency,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  dispatchHeading: {
    color: Colors.emergency,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  dispatchName: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginBottom: 4,
  },
  dispatchEta: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: 4,
  },
  dispatchHospital: {
    color: Colors.warning,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: 4,
  },
  dispatchLocation: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  map: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  stepsContainer: {
    marginBottom: Spacing.md,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11122A',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#2A2B40',
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  stepIcon: {
    fontSize: 22,
  },
  stepContent: {
    flex: 1,
  },
  stepLabel: {
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: 2,
  },
  stepSub: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cancelBtn: {
    backgroundColor: '#1A0808',
    borderWidth: 1,
    borderColor: Colors.emergency,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cancelBtnText: {
    color: Colors.emergency,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  footer: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    paddingBottom: Spacing.md,
  },
});