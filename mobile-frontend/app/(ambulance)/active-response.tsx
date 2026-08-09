import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { Colors, Spacing } from '../../constants/theme';
import { apiCall } from '../../services/api';
import { Coordinate, useSmoothCoordinate } from '../../hooks/use-smooth-coordinate';
import { decodePolyline } from '../../utils/decode-polyline';

// How often this screen reports the EMT's own GPS position to the backend
// while actively responding. Task spec calls for 10-15s; 12s splits that
// range.
const LOCATION_SEND_INTERVAL_MS = 12000;

// Route-call throttling (GET /incidents/{id}/route/, which costs real
// Google Routes API quota per call — see the reasoning note further down
// by maybeFetchRoute). Combines a distance gate with a time-based floor
// and ceiling rather than either alone:
//   - ROUTE_RECALC_DISTANCE_METERS + ROUTE_MIN_INTERVAL_MS: once at least
//     30s has passed AND the EMT has moved >=150m since the last route
//     call's origin, recompute — a route/ETA from 150m away is still
//     close enough to be useful, so no point recomputing for every few
//     metres of GPS jitter.
//   - ROUTE_MAX_INTERVAL_MS: recompute at least once a minute regardless
//     of movement, even if the ambulance is stationary (stopped at a
//     light, parked). This isn't about the route actually changing while
//     stationary — Basic-tier routes don't factor live traffic, so a
//     fixed position's route genuinely wouldn't change — it's a
//     resilience/retry mechanism: if the last call failed (network
//     hiccup, transient 503), this guarantees another attempt within a
//     bounded time instead of only retrying once the EMT happens to move.
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

function formatDistance(meters?: number | null): string {
  if (meters == null) return '—';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null) return '—';
  const minutes = Math.round(seconds / 60);
  return minutes < 1 ? '<1 min' : `${minutes} min`;
}

type RouteState = {
  available: boolean;
  distance_meters?: number;
  duration_seconds?: number;
  polyline?: string;
};

export default function ActiveResponse() {
  const router = useRouter();
  const { incidentId } = useLocalSearchParams<{ incidentId: string }>();

  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<any>(null);
  const [status, setStatus] = useState<'waiting' | 'on_the_way' | 'arrived_on_scene'>('waiting');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [notifying, setNotifying] = useState(false);

  // My own device GPS — the source of truth for my own marker on the map
  // (never derived from the server's ambulance_lat/lng, which is just this
  // same value round-tripped back after a network delay).
  const [myLocation, setMyLocation] = useState<Coordinate | null>(null);
  const myCoordinate = useSmoothCoordinate(myLocation);
  const [route, setRoute] = useState<RouteState | null>(null);
  const lastRouteCallRef = useRef<{ time: number; origin: Coordinate } | null>(null);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  useEffect(() => {
    const fetchIncident = async () => {
      if (!incidentId) return;
      try {
        const data = await apiCall(`/incidents/${incidentId}/medical_detail/`, 'GET', undefined, true);
        setIncident(data);
      } catch (err) {
        console.log('Error fetching incident:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchHospitals = async () => {
      try {
        const data = await apiCall('/auth/hospitals/', 'GET', undefined, true);
        const list = Array.isArray(data) ? data : data.results || [];
        setHospitals(list);
      } catch (err) {
        console.log('Error fetching hospitals:', err);
      }
    };

    fetchIncident();
    fetchHospitals();
  }, [incidentId]);

  // Report my own GPS position to the backend every ~12s while this screen
  // is open, and (throttled separately, see maybeFetchRoute) refresh the
  // route/ETA. Stops on unmount (nav away, e.g. "Add Notes"/back — cleanup
  // below), on the incident turning completed/cancelled (detected from the
  // update_location response itself, see below), and never restarts a
  // second overlapping interval since this effect only depends on
  // [incidentId].
  useEffect(() => {
    if (!incidentId) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function maybeFetchRoute(current: Coordinate) {
      // GET /incidents/{id}/route/ calls Google's Routes API server-side
      // on every hit — real quota, real cost. Calling it on every 12s
      // location tick would burn through that quota ~5x faster than
      // needed for no real benefit (a route recomputed after the
      // ambulance moved 20m isn't meaningfully different from the last
      // one). So this is deliberately decoupled from the location-send
      // cadence and gated on its own schedule — see the constants above
      // for the full reasoning.
      const last = lastRouteCallRef.current;
      const now = Date.now();
      const dueToStaleness = !last || now - last.time >= ROUTE_MAX_INTERVAL_MS;
      const dueToMovement =
        !!last &&
        now - last.time >= ROUTE_MIN_INTERVAL_MS &&
        distanceMeters(last.origin, current) >= ROUTE_RECALC_DISTANCE_METERS;

      if (!dueToStaleness && !dueToMovement) return;

      lastRouteCallRef.current = { time: now, origin: current };
      try {
        const data = await apiCall(`/incidents/${incidentId}/route/`, 'GET', undefined, true);
        if (!cancelled) setRoute(data);
      } catch (err) {
        // Route info is a nice-to-have overlay, not core functionality —
        // degrade to "no route" rather than disrupting the location-send
        // loop or alerting the EMT over a single failed route lookup.
        console.log('Route fetch error:', err);
        if (!cancelled) setRoute({ available: false });
      }
    }

    async function sendLocationTick() {
      try {
        const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
        if (permissionStatus !== 'granted') return;

        const position = await Location.getCurrentPositionAsync({});
        if (cancelled) return;

        const here: Coordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setMyLocation(here);

        const data = await apiCall(
          `/incidents/${incidentId}/update_location/`,
          'PATCH',
          { ambulance_lat: here.latitude, ambulance_lng: here.longitude },
          true
        );
        if (cancelled) return;

        // update_location's response already carries the incident's
        // current status for free (IncidentAmbulanceActiveSerializer
        // includes it) — reusing that instead of running a second,
        // separate polling loop just to detect the incident having been
        // completed/cancelled by someone else (e.g. the patient
        // cancelling) while this screen is open.
        if (data?.status === 'completed' || data?.status === 'cancelled') {
          if (intervalId) clearInterval(intervalId);
          Alert.alert(
            'Emergency Ended',
            data.status === 'cancelled'
              ? 'This emergency was cancelled.'
              : 'This emergency has already been marked completed.'
          );
          router.replace('/(ambulance)/dashboard' as any);
          return;
        }

        maybeFetchRoute(here);
      } catch (err) {
        // Quiet retry — a single missed GPS fix or network hiccup
        // shouldn't interrupt an EMT mid-response with an alert; it just
        // tries again next tick.
        console.log('Location update error:', err);
      }
    }

    sendLocationTick();
    intervalId = setInterval(sendLocationTick, LOCATION_SEND_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  const handleUpdateStatus = async (newStatus: 'on_the_way' | 'arrived_on_scene') => {
    setUpdatingStatus(true);
    try {
      await apiCall(`/incidents/${incidentId}/update_status/`, 'POST', { status: newStatus }, true);
      setStatus(newStatus);
    } catch (err: any) {
      Alert.alert('Error', err.detail || 'Could not update status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleNotifyHospital = async () => {
    if (!selectedHospital) {
      Alert.alert('No Hospital Selected', 'Please select a destination hospital first.');
      return;
    }
    setNotifying(true);
    try {
      await apiCall(`/incidents/${incidentId}/select_hospital/`, 'POST', {
        hospital_user_id: selectedHospital.id,
        eta_minutes: 8,
      }, true);
      Alert.alert('Hospital Notified', `${selectedHospital.facility_name} has been notified and is preparing to receive the patient.`);
    } catch (err: any) {
      console.log('Notify hospital error:', JSON.stringify(err));
      Alert.alert('Error', err.detail || 'Could not notify hospital.');
    } finally {
      setNotifying(false);
    }
  };

  const handleComplete = async () => {
    Alert.alert(
      'Complete Emergency?',
      'Mark this emergency as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await apiCall(`/incidents/${incidentId}/update_status/`, 'POST', { status: 'completed' }, true);
              router.replace('/(ambulance)/dashboard' as any);
            } catch (err: any) {
              Alert.alert('Error', err.detail || 'Could not complete emergency.');
            }
          },
        },
      ]
    );
  };

  if (!fontsLoaded) return null;

  const medical = incident?.medical_summary;

  // incident.latitude/longitude are Django DecimalFields, which DRF
  // serializes as strings (e.g. "-26.204100") — parseFloat before handing
  // to react-native-maps, same gotcha as the patient-side screen.
  const patientCoordinate: Coordinate | null =
    incident?.latitude != null && incident?.longitude != null
      ? { latitude: parseFloat(incident.latitude), longitude: parseFloat(incident.longitude) }
      : null;

  // Only render a route line when a real driving route came back — no
  // straight-line fallback here (unlike the patient screen's still-todo
  // straight line), per spec: "the map should still show both markers
  // even without a route line."
  const routePoints: Coordinate[] =
    route?.available && route.polyline ? decodePolyline(route.polyline) : [];

  return (
    <View style={styles.screen}>

      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={styles.titleBlock}>
            <Text style={styles.heading}>Active Response</Text>
            <Text style={styles.subHeading}>Incident #{incidentId?.slice(0, 8)}</Text>
          </View>
          <View style={styles.liveBadge}>
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      </View>

      {/* Map — mobile only */}
      {Platform.OS !== 'web' && (patientCoordinate || myCoordinate) && (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: (patientCoordinate ?? myCoordinate)!.latitude,
            longitude: (patientCoordinate ?? myCoordinate)!.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          {patientCoordinate && (
            <Marker coordinate={patientCoordinate} title="Patient" pinColor="red" />
          )}
          {myCoordinate && (
            <Marker coordinate={myCoordinate} title="Your location" pinColor="blue" />
          )}
          {routePoints.length > 1 && (
            <Polyline coordinates={routePoints} strokeColor={Colors.primary} strokeWidth={4} />
          )}
        </MapView>
      )}

      {Platform.OS !== 'web' && !patientCoordinate && !myCoordinate && (
        <View style={[styles.map, { backgroundColor: '#1A1D35', justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      )}

      {Platform.OS === 'web' && (
        <View style={[styles.map, { backgroundColor: '#1A1D35', justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: Colors.textSecondary }}>📍 Map available on mobile</Text>
        </View>
      )}

      <View style={styles.addressRow}>
        {route?.available ? (
          <Text style={styles.addressText}>
            🚗 {formatDistance(route.distance_meters)} away • ETA {formatDuration(route.duration_seconds)}
          </Text>
        ) : (
          <Text style={styles.addressText}>📍 Patient location shared</Text>
        )}
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >

        {/* Patient Card */}
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.patientCard}>
            <View style={styles.patientTitleRow}>
              <Text style={styles.patientEmoji}>🚨</Text>
              <Text style={styles.patientLabel}>PATIENT</Text>
            </View>
            <Text style={styles.patientName}>
              {medical?.full_name || 'Unknown Patient'} • {medical?.blood_type || '—'}
            </Text>
            <Text style={styles.patientConditions}>
              {medical?.chronic_conditions || 'No conditions listed'}
            </Text>
            {medical?.known_allergies ? (
              <Text style={styles.allergyText}>⚠️ Allergic to {medical.known_allergies}</Text>
            ) : null}
            {medical?.current_medications ? (
              <Text style={styles.medicationText}>💊 {medical.current_medications}</Text>
            ) : null}
            {medical?.paramedic_notes ? (
              <Text style={styles.notesText}>📋 {medical.paramedic_notes}</Text>
            ) : null}
          </View>
        )}

        {/* Select Destination Hospital */}
        <Text style={styles.sectionLabel}>SELECT DESTINATION HOSPITAL</Text>

        {hospitals.length === 0 ? (
          <ActivityIndicator color={Colors.primary} style={{ marginBottom: 12 }} />
        ) : (
          hospitals.map((hospital) => (
            <TouchableOpacity
              key={hospital.id}
              style={[
                styles.hospitalCard,
                selectedHospital?.id === hospital.id && styles.hospitalCardSelected,
              ]}
              onPress={() => setSelectedHospital(hospital)}
            >
              <View style={styles.hospitalLeft}>
                <Text style={styles.hospitalIcon}>🏥</Text>
                <View>
                  <Text style={styles.hospitalName}>{hospital.facility_name}</Text>
                  <Text style={styles.hospitalMeta}>
                    {hospital.facility_type?.charAt(0).toUpperCase() + hospital.facility_type?.slice(1)} • {hospital.province}
                  </Text>
                </View>
              </View>
              <View style={styles.hospitalRight}>
                <View style={[
                  styles.hospitalTypeBadge,
                  hospital.facility_type === 'private' ? styles.privateBadge : styles.publicBadge,
                ]}>
                  <Text style={[
                    styles.hospitalTypeText,
                    hospital.facility_type === 'private' ? styles.privateText : styles.publicText,
                  ]}>
                    {hospital.facility_type?.charAt(0).toUpperCase() + hospital.facility_type?.slice(1)}
                  </Text>
                </View>
                {selectedHospital?.id === hospital.id && (
                  <Text style={styles.checkmark}> ✓</Text>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* Notify Hospital Button */}
        <TouchableOpacity
          style={[styles.notifyButton, notifying && { opacity: 0.6 }]}
          onPress={handleNotifyHospital}
          disabled={notifying}
        >
          {notifying ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.notifyButtonText}>
              🏥 Notify {selectedHospital?.facility_name || 'Hospital'} — ETA 8 min
            </Text>
          )}
        </TouchableOpacity>

        {/* Update Response Status */}
        <Text style={styles.sectionLabel}>UPDATE RESPONSE STATUS</Text>

        <TouchableOpacity
          style={[styles.onTheWayButton, status === 'on_the_way' && styles.onTheWayButtonActive]}
          onPress={() => handleUpdateStatus('on_the_way')}
          disabled={updatingStatus}
        >
          <Text style={styles.onTheWayText}>
            {updatingStatus && status !== 'arrived_on_scene' ? 'Updating...' : 'On the Way'}
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomRow}>
          <TouchableOpacity
            style={[styles.arrivedButton, status === 'arrived_on_scene' && styles.arrivedButtonActive]}
            onPress={() => handleUpdateStatus('arrived_on_scene')}
            disabled={updatingStatus}
          >
            <Text style={styles.arrivedText}>Arrived on Scene</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addNotesButton}
            onPress={() => router.push({
              pathname: '/(ambulance)/treatment-notes' as any,
              params: { incidentId },
            })}
          >
            <Text style={styles.addNotesText}>Add Notes</Text>
          </TouchableOpacity>
        </View>

        {/* Complete Emergency */}
        <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
          <Text style={styles.completeButtonText}>✅ Emergency Completed</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  stickyHeader: {
    backgroundColor: Colors.background,
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 12,
    zIndex: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backArrow: { color: Colors.textSecondary, fontSize: 22 },
  titleBlock: { alignItems: 'center', flex: 1 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.textPrimary },
  subHeading: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  liveBadge: { backgroundColor: Colors.emergency, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  liveText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.white },
  map: { width: '100%', height: 220 },
  addressRow: { paddingHorizontal: Spacing.lg, paddingVertical: 10, backgroundColor: Colors.background },
  addressText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.primary, textAlign: 'center' },
  scroll: { flex: 1 },
  container: { paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 80 },
  patientCard: {
    backgroundColor: '#2A0A0A', borderWidth: 2, borderColor: Colors.emergency,
    borderRadius: 16, padding: 16, marginBottom: 24,
  },
  patientTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  patientEmoji: { fontSize: 16 },
  patientLabel: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2, color: Colors.emergency },
  patientName: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.textPrimary, marginBottom: 4 },
  patientConditions: { fontFamily: 'Inter_400Regular', fontSize: 15, color: Colors.textSecondary, marginBottom: 8 },
  allergyText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.warning, marginBottom: 4 },
  medicationText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.textSecondary, marginBottom: 4 },
  notesText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2, color: Colors.textSecondary, marginBottom: 12 },
  hospitalCard: {
    backgroundColor: '#1A1D35', borderWidth: 1, borderColor: '#2A2D45',
    borderRadius: 14, padding: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  hospitalCardSelected: { borderColor: Colors.primary, backgroundColor: '#1A2545' },
  hospitalLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hospitalIcon: { fontSize: 28 },
  hospitalName: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.textPrimary, marginBottom: 2 },
  hospitalMeta: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.textSecondary },
  hospitalRight: { flexDirection: 'row', alignItems: 'center' },
  hospitalTypeBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  privateBadge: { backgroundColor: '#1E2D52' },
  publicBadge: { backgroundColor: '#0D2E1A' },
  hospitalTypeText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  privateText: { color: Colors.primary },
  publicText: { color: Colors.success },
  checkmark: { color: Colors.primary, fontSize: 18, fontWeight: 'bold' },
  notifyButton: {
    backgroundColor: Colors.primary, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center', marginBottom: 24, marginTop: 4,
  },
  notifyButtonText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.white },
  onTheWayButton: {
    backgroundColor: '#1A1D35', borderRadius: 14, paddingVertical: 18,
    alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#2A2D45',
  },
  onTheWayButtonActive: { borderColor: Colors.primary, backgroundColor: '#1A2545' },
  onTheWayText: { fontFamily: 'Inter_700Bold', fontSize: 17, color: Colors.textPrimary },
  bottomRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  arrivedButton: { flex: 1, backgroundColor: Colors.warning, borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  arrivedButtonActive: { opacity: 0.8 },
  arrivedText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#000000' },
  addNotesButton: {
    flex: 1, backgroundColor: '#1A1D35', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary,
  },
  addNotesText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.primary },
  completeButton: {
    backgroundColor: '#0A2010', borderWidth: 1, borderColor: Colors.success,
    borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginTop: 8,
  },
  completeButtonText: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.success },
});