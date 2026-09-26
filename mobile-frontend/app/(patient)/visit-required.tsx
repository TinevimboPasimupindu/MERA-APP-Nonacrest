import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

const BRING_ITEMS = [
  'South African ID / Passport',
  'Prescription slips or medication boxes',
  'Previous medical records (if available)',
];

export default function VisitRequiredScreen() {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        setRequest(await apiCall(ENDPOINTS.verificationMyStatus, 'GET', undefined, true));
      } catch (err: any) {
        setError(err.detail || 'Could not load your verification status.');
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const openMaps = () => {
    const query = [request?.hospital_name, request?.hospital_address].filter(Boolean).join(', ');
    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(query)}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // Only a flagged request has a visit to show — anything else (error,
  // no request, or the flag was since resolved) gets a plain message.
  if (error || request?.status !== 'flagged') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.statusTitle}>
            {error ? "Couldn't load your visit details" : 'No visit required'}
          </Text>
          <Text style={styles.statusText}>
            {error || "Your hospital hasn't asked you to come in for an in-person visit."}
          </Text>
          <TouchableOpacity style={[styles.secondaryBtn, styles.backBtn]} onPress={() => router.back()}>
            <Text style={styles.secondaryBtnText}>Go Back</Text>
          </TouchableOpacity>
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
          <Text style={styles.appName}>MERA</Text>
          <View style={styles.actionBadge}>
            <Text style={styles.actionBadgeText}>⚠️  Action Required</Text>
          </View>
        </View>

        {/* Status card */}
        <View style={styles.statusCard}>
          <View style={styles.iconCircle}>
            <Text style={styles.statusIcon}>⚠️</Text>
          </View>
          <Text style={styles.statusTitle}>In-Person Visit Required</Text>
          <Text style={styles.statusText}>
            Your hospital was unable to verify your medical information remotely. Please visit the hospital to confirm your details in person.
          </Text>
        </View>

        {/* Clinician note */}
        {request.hospital_note ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>📋  Hospital's Note</Text>
            <Text style={styles.noteText}>"{request.hospital_note}"</Text>
          </View>
        ) : null}

        {/* Hospital details */}
        <View style={styles.hospitalCard}>
          <Text style={styles.hospitalTitle}>🏥  Visit This Hospital</Text>
          <Text style={styles.hospitalName}>{request.hospital_name}</Text>
          {request.hospital_address ? (
            <Text style={styles.hospitalAddress}>{request.hospital_address}</Text>
          ) : null}
          {request.hospital_visiting_hours ? (
            <Text style={styles.hospitalHours}>{request.hospital_visiting_hours}</Text>
          ) : null}
          <TouchableOpacity style={styles.directionsBtn} onPress={openMaps}>
            <Text style={styles.directionsBtnText}>📍  Get Directions</Text>
          </TouchableOpacity>
        </View>

        {/* What to bring */}
        <View style={styles.bringCard}>
          <Text style={styles.bringTitle}>📎  What to bring</Text>
          {BRING_ITEMS.map((item, i) => (
            <Text key={i} style={styles.bringItem}>•  {item}</Text>
          ))}
        </View>

        {/* Action buttons */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(patient)/medical-intake' as any)}
        >
          <Text style={styles.primaryBtnText}>Re-submit After Visit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push('/(patient)/hospital-selection' as any)}
        >
          <Text style={styles.secondaryBtnText}>Choose a Different Hospital</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  backBtn: { marginTop: Spacing.lg, alignSelf: 'stretch' },
  scroll: { flex: 1, paddingHorizontal: Spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: FontSizes.xl,
    fontWeight: '700',
  },
  actionBadge: {
    backgroundColor: '#1A0000',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  actionBadgeText: {
    color: Colors.danger,
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: '#1A0A0A',
    borderWidth: 1.5,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2A0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  statusIcon: { fontSize: 28 },
  statusTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  statusText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  noteCard: {
    backgroundColor: '#120808',
    borderWidth: 1,
    borderColor: '#3A1A1A',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  noteLabel: {
    color: Colors.danger,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  noteText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  hospitalCard: {
    backgroundColor: '#11122A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  hospitalTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  hospitalName: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: 4,
  },
  hospitalAddress: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginBottom: 4,
  },
  hospitalHours: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginBottom: Spacing.md,
  },
  directionsBtn: {
    backgroundColor: '#1A1C30',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  directionsBtnText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  bringCard: {
    backgroundColor: '#11122A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  bringTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  bringItem: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 22,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  primaryBtnText: {
    color: Colors.white,
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  secondaryBtn: {
    backgroundColor: '#11122A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
});
