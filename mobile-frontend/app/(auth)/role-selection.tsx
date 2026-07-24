import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

import { useRouter } from 'expo-router';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { Colors, Spacing } from '../../constants/theme';

export default function RoleSelectionScreen() {

  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  if (!fontsLoaded) return null;

  return (

    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
    >

      {/* STICKY HEADER */}
      <View style={styles.stickyHeader}>
        <Text style={styles.heading}>Choose Your Role</Text>
        <Text style={styles.subHeading}>
          Step 1 of 3 • Select how you'll use MERA
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.activeBar} />
          <View style={styles.inactiveBar} />
          <View style={styles.inactiveBar} />
        </View>
      </View>

      {/* Patient Card */}
      <View style={styles.patientCard}>
        <Text style={styles.cardEmoji}>👤</Text>
        <Text style={styles.cardTitle}>Patient</Text>
        <Text style={styles.cardDescription}>
          Activate emergency alerts, manage your medical profile & connect with your care team.
        </Text>
        <TouchableOpacity
          style={styles.patientButton}
          onPress={() => router.push('/(auth)/register' as any)}
        >
          <Text style={styles.patientButtonText}>Register as Patient</Text>
        </TouchableOpacity>
      </View>

      {/* Hospital Card */}
      <View style={styles.hospitalCard}>
        <Text style={styles.cardEmoji}>🏥</Text>
        <Text style={styles.cardTitle}>Hospital</Text>
        <Text style={styles.cardDescription}>
          Verify patient records, receive incoming patient notifications and manage your facility on MERA.
        </Text>
        <TouchableOpacity
          style={styles.hospitalButton}
          onPress={() => router.push('/(hospital)/RegisterHospitalStep1' as any)}
        >
          <Text style={styles.hospitalButtonText}>Register a Hospital</Text>
        </TouchableOpacity>
      </View>

      {/* Ambulance Card */}
      <View style={styles.ambulanceCard}>
        <Text style={styles.cardEmoji}>🚑</Text>
        <Text style={styles.cardTitle}>Ambulance Service</Text>
        <Text style={styles.cardDescription}>
          Receive SOS dispatches, view patient data, select hospitals and submit treatment notes.
        </Text>
        <TouchableOpacity
          style={styles.ambulanceButton}
          onPress={() => router.push('/(ambulance)/ambulance-register1' as any)}
        >
          <Text style={styles.ambulanceButtonText}>Register an Ambulance</Text>
        </TouchableOpacity>
      </View>

      {/* Back to Login */}
      <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
        <Text style={styles.backText}>← Back to Login</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 80,
  },
  stickyHeader: {
    backgroundColor: Colors.background,
    paddingTop: 60,
    paddingBottom: 20,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 42,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subHeading: {
    fontFamily: 'Inter_400Regular',
    fontSize: 18,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
    marginBottom: 10,
  },
  activeBar: {
    height: 8,
    width: '31%',
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  inactiveBar: {
    height: 8,
    width: '31%',
    backgroundColor: '#3A3D5A',
    borderRadius: 999,
  },
  patientCard: {
    backgroundColor: '#1E2D52',
    borderWidth: 3,
    borderColor: '#3D82FF',
    borderRadius: 28,
    padding: 24,
    marginBottom: 28,
  },
  hospitalCard: {
    backgroundColor: '#032E1C',
    borderWidth: 3,
    borderColor: '#28D66F',
    borderRadius: 28,
    padding: 24,
    marginBottom: 28,
  },
  ambulanceCard: {
    backgroundColor: '#3D1207',
    borderWidth: 3,
    borderColor: '#FF5B2E',
    borderRadius: 28,
    padding: 24,
    marginBottom: 40,
  },
  cardEmoji: {
    fontSize: 52,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: Colors.textPrimary,
    marginBottom: 14,
  },
  cardDescription: {
    fontFamily: 'Inter_400Regular',
    fontSize: 18,
    color: Colors.textSecondary,
    lineHeight: 28,
    marginBottom: 24,
  },
  patientButton: {
    backgroundColor: '#4B8DFF',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  patientButtonText: {
    color: Colors.white,
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  hospitalButton: {
    backgroundColor: '#31D26B',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  hospitalButtonText: {
    color: '#000',
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  ambulanceButton: {
    backgroundColor: '#FF7A17',
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  ambulanceButtonText: {
    color: Colors.white,
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  backText: {
    textAlign: 'center',
    color: Colors.textSecondary,
    fontSize: 18,
    fontFamily: 'Inter_400Regular',
  },
});