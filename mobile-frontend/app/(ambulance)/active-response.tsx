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

import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { Colors, Spacing } from '../../constants/theme';
import { apiCall } from '../../services/api';

const PATIENT_LOCATION = {
  latitude: -26.2041,
  longitude: 28.0473,
};

const AMBULANCE_LOCATION = {
  latitude: -26.1929,
  longitude: 28.0305,
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
      {Platform.OS !== 'web' && (
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
      )}

      {Platform.OS === 'web' && (
        <View style={[styles.map, { backgroundColor: '#1A1D35', justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: Colors.textSecondary }}>📍 Map available on mobile</Text>
        </View>
      )}

      <View style={styles.addressRow}>
        <Text style={styles.addressText}>📍 Patient location shared</Text>
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