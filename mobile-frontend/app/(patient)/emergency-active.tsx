import React, { useEffect, useRef, useState } from 'react';
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
import { Coordinate, useSmoothCoordinate } from '../../hooks/use-smooth-coordinate';
import { decodePolyline } from '../../utils/decode-polyline';

// Route-call throttling — same reasoning and constants as
// active-response.tsx's maybeFetchRoute (see PROJECT_CONTEXT.md for the
// full write-up), just measuring a different party's movement: there, it's
// the EMT's own device GPS changing between their 12s ticks; here, the
// patient's own SOS location never moves, so what matters is the
// AMBULANCE's server-reported position changing between this screen's own
// 10s incident polls. Same distance/time gates, same underlying judgment
// call about how far is "far enough" to justify another Google Routes API
// call — that judgment doesn't depend on which side is doing the polling.
const ROUTE_MIN_INTERVAL_MS = 30000;
const ROUTE_MAX_INTERVAL_MS = 60000;
const ROUTE_RECALC_DISTANCE_METERS = 150;

function distanceMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type RouteState = {
  available: boolean;
  distance_meters?: number;
  duration_seconds?: number;
  polyline?: string;
};

export default function EmergencyActiveScreen() {
  const { incidentId } = useLocalSearchParams<{ incidentId: string }>();
  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteState | null>(null);
  const lastRouteCallRef = useRef<{ time: number; origin: Coordinate } | null>(null);

  // Poll for incident updates every 10 seconds
  useEffect(() => {
    if (!incidentId) return;
    let cancelled = false;

    async function maybeFetchRoute(ambulancePosition: Coordinate) {
      // GET /incidents/{id}/route/ calls Google's Routes API server-side —
      // real quota per call, so this is deliberately not fired on every
      // 10s poll. See the constants above for the throttling reasoning.
      const last = lastRouteCallRef.current;
      const now = Date.now();
      const dueToStaleness = !last || now - last.time >= ROUTE_MAX_INTERVAL_MS;
      const dueToMovement =
        !!last &&
        now - last.time >= ROUTE_MIN_INTERVAL_MS &&
        distanceMeters(last.origin, ambulancePosition) >= ROUTE_RECALC_DISTANCE_METERS;

      if (!dueToStaleness && !dueToMovement) return;

      lastRouteCallRef.current = { time: now, origin: ambulancePosition };
      try {
        const data = await apiCall(`/incidents/${incidentId}/route/`, 'GET', undefined, true);
        if (!cancelled) setRoute(data);
      } catch (err) {
        // Route info is a nice-to-have overlay, not core functionality —
        // degrade to "no route" rather than disrupting the incident poll
        // or alerting the patient over a single failed route lookup.
        console.log('Route fetch error:', err);
        if (!cancelled) setRoute({ available: false });
      }
    }

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
        if (cancelled) return;
        setIncident(data);

        // Navigate away if emergency is completed or cancelled
        if (data.status === 'completed' || data.status === 'cancelled') {
          router.replace('/(patient)/patient-dashboard' as any);
          return;
        }

        if (data.ambulance_lat != null && data.ambulance_lng != null) {
          maybeFetchRoute({ latitude: data.ambulance_lat, longitude: data.ambulance_lng });
        }
      } catch (err) {
        console.log('Error fetching incident:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchIncident();
    const interval = setInterval(fetchIncident, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [incidentId]);

  // incident.latitude/longitude are Django DecimalFields, which DRF
  // serializes as strings (e.g. "-26.204100") — parseFloat before handing
  // to react-native-maps. ambulance_lat/ambulance_lng are plain FloatFields
  // and already arrive as numbers. Coordinates are nullable on both sides
  // (a SOS can be triggered without GPS, and the ambulance hasn't sent a
  // location yet until its first update_location call), so both resolve to
  // null rather than NaN when absent.
  const patientCoordinate: Coordinate | null =
    incident?.latitude != null && incident?.longitude != null
      ? { latitude: parseFloat(incident.latitude), longitude: parseFloat(incident.longitude) }
      : null;

  const ambulanceTarget: Coordinate | null =
    incident?.ambulance_lat != null && incident?.ambulance_lng != null
      ? { latitude: incident.ambulance_lat, longitude: incident.ambulance_lng }
      : null;

  const ambulanceCoordinate = useSmoothCoordinate(ambulanceTarget);

  // Only render a route line when a real driving route came back — no
  // straight-line fallback (that's what this replaces). Both markers still
  // render regardless; a missing/failed route just means no line.
  const routePoints: Coordinate[] =
    route?.available && route.polyline ? decodePolyline(route.polyline) : [];

  // Mirrors the backend's cancellable-statuses set exactly (cancel_incident
  // in emergencies/services.py) — PENDING_CONFIRMATION/ACTIVE/DISPATCHED/
  // ON_THE_WAY, not ARRIVED_ON_SCENE or later. Matches this app's existing
  // "prevent the action, don't just show an error after the fact" pattern
  // (see register.tsx's consent checkbox) — the button disappears once the
  // crew is on scene rather than staying visible only to fail with an
  // alert every time. `incident` being null (still loading, or a
  // brand-new not-yet-fetched SOS) defaults to cancellable, since that's
  // overwhelmingly the common case at that point and the backend remains
  // the real enforcement point regardless.
  const cancellableStatuses = ['pending_confirmation', 'active', 'dispatched', 'on_the_way'];
  const canCancel = !incident || cancellableStatuses.includes(incident.status);

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
              router.replace('/(patient)/patient-dashboard' as any);
            } catch (err: any) {
              // Cancellation is allowed through ON_THE_WAY but backend-
              // rejected once ARRIVED_ON_SCENE (see cancellable below —
              // this catch is now mostly a safety net for a status change
              // that happened between this screen's last poll and the tap,
              // not the primary way ARRIVED_ON_SCENE is enforced). A
              // failure here means the emergency is still genuinely
              // active, so stay on this screen and say so rather than
              // navigating away as if it had been cancelled when it hasn't
              // been.
              console.log('Cancel error:', err);
              Alert.alert(
                'Could Not Cancel',
                err.detail || 'This emergency could not be cancelled — it may already have an ambulance on the way.'
              );
            }
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
          {patientCoordinate ? (
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: patientCoordinate.latitude,
                longitude: patientCoordinate.longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              <Marker coordinate={patientCoordinate} title="Your location" pinColor="red" />
              {ambulanceCoordinate && (
                <Marker coordinate={ambulanceCoordinate} title="Ambulance" pinColor="blue" />
              )}
              {routePoints.length > 1 && (
                <Polyline coordinates={routePoints} strokeColor={Colors.primary} strokeWidth={4} />
              )}
            </MapView>
          ) : (
            <View style={[styles.map, styles.mapPlaceholder]}>
              <Text style={styles.mapPlaceholderText}>Waiting for your location…</Text>
            </View>
          )}

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

          {/* Cancel Button — hidden once the crew is on scene or later,
              rather than staying visible only to fail with an error every
              time (see canCancel above). */}
          {canCancel ? (
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Cancel Emergency</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.cancelUnavailable}>
              <Text style={styles.cancelUnavailableText}>
                The crew is on scene — cancellation is no longer available. Speak with them directly if you need to.
              </Text>
            </View>
          )}

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
  mapPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#11122A',
    borderWidth: 1,
    borderColor: '#2A2B40',
  },
  mapPlaceholderText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
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
  cancelUnavailable: {
    backgroundColor: '#11122A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cancelUnavailableText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    paddingBottom: Spacing.md,
  },
});