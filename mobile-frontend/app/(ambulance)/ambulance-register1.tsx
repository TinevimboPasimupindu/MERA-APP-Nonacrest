import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';

import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

export default function RegisterAmbulanceScreen() {
  const router = useRouter();

  const [serviceType, setServiceType] = useState('Private');
  const [serviceName, setServiceName] = useState('');
  const [operatingRegions, setOperatingRegions] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [dispatchAddress, setDispatchAddress] = useState('');
  const [activeAmbulances, setActiveAmbulances] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  if (!fontsLoaded) return null;

  const handleNext = () => {
    if (!serviceName || !operatingRegions || !licenseNumber || !dispatchAddress || !activeAmbulances || !email || !password || !confirmPassword) {
      alert('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    router.push({
      pathname: '/(ambulance)/ambulance-register2' as any,
      params: {
        service_name: serviceName,
        service_type: serviceType,
        operational_areas: operatingRegions,
        license_number: licenseNumber,
        dispatch_address: dispatchAddress,
        number_of_active_ambulances: activeAmbulances,
        email,
        password,
        confirm_password: confirmPassword,
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
          <Text style={styles.subtitle}>Step 1 of 3 • Service Information</Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={[styles.progressLine, styles.activeProgress]} />
          <View style={styles.progressLine} />
          <View style={styles.progressLine} />
        </View>
      </View>

      {/* SCROLLABLE CONTENT */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

        {/* INFO CARD */}
        <View style={styles.infoCard}>
          <Text style={styles.emoji}>🚑</Text>
          <Text style={styles.infoText}>
            You are registering an EMS / ambulance service on the MERA dispatch network.
          </Text>
        </View>

        {/* EMAIL */}
        <View style={styles.section}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <TextInput
            placeholder="Official EMS email address"
            placeholderTextColor="#5E6895"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* PASSWORD */}
        <View style={styles.section}>
          <Text style={styles.label}>CREATE PASSWORD</Text>
          <TextInput
            placeholder="Create a strong password"
            placeholderTextColor="#5E6895"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {/* CONFIRM PASSWORD */}
        <View style={styles.section}>
          <Text style={styles.label}>CONFIRM PASSWORD</Text>
          <TextInput
            placeholder="Repeat your password"
            placeholderTextColor="#5E6895"
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        {/* SERVICE NAME */}
        <View style={styles.section}>
          <Text style={styles.label}>EMS / AMBULANCE SERVICE NAME</Text>
          <TextInput
            placeholder="e.g. Private EMS, Netcare 911, ER24"
            placeholderTextColor="#5E6895"
            style={styles.input}
            value={serviceName}
            onChangeText={setServiceName}
          />
        </View>

        {/* SERVICE TYPE */}
        <View style={styles.section}>
          <Text style={styles.label}>SERVICE TYPE</Text>
          <View style={styles.typeContainer}>
            {['Private', 'Public', 'NGO'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.typeButton, serviceType === type && styles.activeTypeButton]}
                onPress={() => setServiceType(type)}
              >
                <Text style={[styles.typeText, serviceType === type && styles.activeTypeText]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* OPERATING REGIONS */}
        <View style={styles.section}>
          <Text style={styles.label}>OPERATING REGIONS / COVERAGE AREA</Text>
          <TextInput
            placeholder="e.g. Johannesburg, Soweto, Randburg"
            placeholderTextColor="#5E6895"
            style={styles.input}
            value={operatingRegions}
            onChangeText={setOperatingRegions}
          />
        </View>

        {/* LICENSE NUMBER */}
        <View style={styles.section}>
          <Text style={styles.label}>EMS REGISTRATION / LICENSE NUMBER</Text>
          <TextInput
            placeholder="Official EMS license number"
            placeholderTextColor="#5E6895"
            style={styles.input}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
          />
        </View>

        {/* ADDRESS */}
        <View style={styles.section}>
          <Text style={styles.label}>BASE / DISPATCH ADDRESS</Text>
          <TextInput
            placeholder="Main dispatch centre address"
            placeholderTextColor="#5E6895"
            style={styles.input}
            value={dispatchAddress}
            onChangeText={setDispatchAddress}
          />
        </View>

        {/* AMBULANCES */}
        <View style={styles.section}>
          <Text style={styles.label}>NUMBER OF ACTIVE AMBULANCES</Text>
          <TextInput
            placeholder="e.g. 12"
            placeholderTextColor="#5E6895"
            keyboardType="numeric"
            style={styles.input}
            value={activeAmbulances}
            onChangeText={setActiveAmbulances}
          />
        </View>

        {/* NEXT BUTTON */}
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>Next →</Text>
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
  infoCard: {
    marginTop: 18,
    marginHorizontal: 24,
    backgroundColor: '#3B0B00',
    borderWidth: 1.5,
    borderColor: '#F97316',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  emoji: { fontSize: 28 },
  infoText: {
    flex: 1,
    color: '#B8C1E8',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
  },
  section: {
    marginTop: 28,
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
  typeContainer: {
    backgroundColor: '#0F1738',
    borderWidth: 1.5,
    borderColor: '#24356E',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeButton: {
    paddingHorizontal: 22,
    height: 54,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#24356E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTypeButton: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  typeText: {
    color: '#9CA8D4',
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  activeTypeText: {
    color: '#FFFFFF',
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
    marginBottom: 40,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
  },
});