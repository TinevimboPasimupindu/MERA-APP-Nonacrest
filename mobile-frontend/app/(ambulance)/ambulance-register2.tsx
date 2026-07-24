import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';

import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

export default function AmbulanceRegister2Screen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [adminName, setAdminName] = useState('');
  const [dispatchPhone, setDispatchPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [preferredHospitals, setPreferredHospitals] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(['ALS', 'BLS', 'ICU Transport']);

  const capabilities = ['ALS', 'BLS', 'ICU Transport'];

  const toggleCapability = (capability: string) => {
    if (selectedCapabilities.includes(capability)) {
      setSelectedCapabilities(selectedCapabilities.filter((item) => item !== capability));
    } else {
      setSelectedCapabilities([...selectedCapabilities, capability]);
    }
  };

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  if (!fontsLoaded) return null;

  const handleNext = () => {
    if (!adminName || !dispatchPhone) {
      alert('Please fill in all required fields.');
      return;
    }

    router.push({
      pathname: '/(ambulance)/ambulance-register3' as any,
      params: {
        // Pass through from step 1
        service_name: params.service_name,
        service_type: params.service_type,
        operational_areas: params.operational_areas,
        license_number: params.license_number,
        dispatch_address: params.dispatch_address,
        number_of_active_ambulances: params.number_of_active_ambulances,
        email: params.email,
        password: params.password,
        confirm_password: params.confirm_password,
        // From step 2
        admin_contact_name: adminName,
        dispatch_phone: dispatchPhone,
        admin_phone: secondaryPhone,
        capabilities: selectedCapabilities.join(','),
        preferred_hospitals: preferredHospitals,
      },
    });
  };

  return (
    <View style={styles.container}>

      {/* FIXED HEADER */}
      <View style={styles.fixedHeader}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="#D7DDF7" style={{ marginTop: 35 }} />
          </TouchableOpacity>
          <Text style={styles.title}>Register an Ambulance</Text>
          <Text style={styles.subtitle}>Step 2 of 3 • Contact & Fleet Details</Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={[styles.progressLine, styles.activeProgress]} />
          <View style={[styles.progressLine, styles.activeProgress]} />
          <View style={styles.progressLine} />
        </View>
      </View>

      {/* SCROLLABLE CONTENT */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        <Text style={styles.topQuestion}>
          Who coordinates dispatches for this service?
        </Text>

        {/* ADMIN NAME */}
        <View style={styles.section}>
          <Text style={styles.label}>DISPATCHER / ADMINISTRATOR NAME</Text>
          <TextInput
            placeholder="Name of the account manager"
            placeholderTextColor="#5E6895"
            style={styles.input}
            value={adminName}
            onChangeText={setAdminName}
          />
        </View>

        {/* DISPATCH NUMBER */}
        <View style={styles.section}>
          <Text style={styles.label}>EMERGENCY DISPATCH NUMBER</Text>
          <TextInput
            placeholder="24/7 dispatch line"
            placeholderTextColor="#5E6895"
            keyboardType="phone-pad"
            style={styles.input}
            value={dispatchPhone}
            onChangeText={setDispatchPhone}
          />
        </View>

        {/* SECONDARY NUMBER */}
        <View style={styles.section}>
          <Text style={styles.label}>SECONDARY CONTACT NUMBER</Text>
          <TextInput
            placeholder="Backup contact"
            placeholderTextColor="#5E6895"
            keyboardType="phone-pad"
            style={styles.input}
            value={secondaryPhone}
            onChangeText={setSecondaryPhone}
          />
        </View>

        {/* CAPABILITIES */}
        <View style={styles.section}>
          <Text style={styles.label}>AMBULANCE CAPABILITIES</Text>
          <View style={styles.capabilityContainer}>
            {capabilities.map((capability) => {
              const selected = selectedCapabilities.includes(capability);
              return (
                <TouchableOpacity
                  key={capability}
                  style={[styles.capabilityChip, selected && styles.activeCapabilityChip]}
                  onPress={() => toggleCapability(capability)}
                >
                  <Text style={[styles.capabilityText, selected && styles.activeCapabilityText]}>
                    {capability}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* PREFERRED HOSPITALS */}
        <View style={styles.section}>
          <Text style={styles.label}>PREFERRED HOSPITAL PARTNERS (optional)</Text>
          <TextInput
            placeholder="e.g. Netcare Milpark, Charlotte Maxeke..."
            placeholderTextColor="#5E6895"
            style={styles.input}
            value={preferredHospitals}
            onChangeText={setPreferredHospitals}
          />
        </View>

        {/* NEXT BUTTON */}
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Next →</Text>
        </TouchableOpacity>

        {/* BACK BUTTON */}
        <TouchableOpacity style={styles.editButton} onPress={() => router.back()}>
          <Text style={styles.editButtonText}>Go Back & Edit</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02031A',
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: '#02031A',
  },
  scrollContent: {
    paddingTop: 210,
    paddingBottom: 40,
  },
  header: {
    backgroundColor: '#3A0700',
    paddingTop: 70,
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 66,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  subtitle: {
    color: '#A9B1D6',
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#02031A',
  },
  progressLine: {
    flex: 1,
    height: 7,
    backgroundColor: '#232B57',
    borderRadius: 999,
  },
  activeProgress: {
    backgroundColor: '#3B82F6',
  },
  topQuestion: {
    color: '#A9B1D6',
    fontSize: 17,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    marginTop: 12,
    marginBottom: 18,
  },
  section: {
    marginTop: 22,
    paddingHorizontal: 24,
  },
  label: {
    color: '#58639B',
    fontSize: 14,
    marginBottom: 12,
    fontFamily: 'Inter_700Bold',
  },
  input: {
    height: 60,
    backgroundColor: '#0F1738',
    borderWidth: 1.5,
    borderColor: '#24356E',
    borderRadius: 18,
    paddingHorizontal: 24,
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Inter_400Regular',
  },
  capabilityContainer: {
    backgroundColor: '#0F1738',
    borderWidth: 1.5,
    borderColor: '#24356E',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  capabilityChip: {
    paddingHorizontal: 22,
    height: 52,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A224A',
  },
  activeCapabilityChip: {
    backgroundColor: '#2A1204',
  },
  capabilityText: {
    color: '#5E6895',
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  activeCapabilityText: {
    color: '#FF8A1D',
    fontFamily: 'Inter_700Bold',
  },
  nextButton: {
    marginTop: 70,
    marginHorizontal: 24,
    height: 72,
    backgroundColor: '#F97316',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
  },
  editButton: {
    marginTop: 24,
    marginHorizontal: 24,
    height: 72,
    backgroundColor: '#10183A',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  editButtonText: {
    color: '#A9B1D6',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
});