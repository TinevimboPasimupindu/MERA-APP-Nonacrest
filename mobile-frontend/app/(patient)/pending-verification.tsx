import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';

const STEPS = [
  { icon: '✅', label: 'Medical information submitted' },
  { icon: '✅', label: 'Consent given' },
  { icon: '✅', label: 'Charlotte Maxeke Hospital selected' },
  { icon: '⏳', label: 'Hospital review  —  in progress', pending: true },
];

export default function PendingVerificationScreen() {
  const [dots, setDots] = useState('');

  // Animated dots to show it's actively waiting
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>MERA</Text>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>⏳ Pending</Text>
          </View>
        </View>

        {/* Status card */}
        <View style={styles.statusCard}>
          <View style={styles.pulseOuter}>
            <View style={styles.pulseInner}>
              <Text style={styles.pulseIcon}>⏳</Text>
            </View>
          </View>
          <Text style={styles.statusTitle}>Verification Pending</Text>
          <Text style={styles.statusSub}>
            A hospital is reviewing your medical information{dots}{'\n'}
            This may take 1–2 business days.
          </Text>
        </View>

        {/* Checklist */}
        <Text style={styles.sectionLabel}>What you submitted</Text>
        {STEPS.map((s, i) => (
          <View key={i} style={[styles.stepCard, s.pending && styles.stepCardPending]}>
            <Text style={styles.stepIcon}>{s.icon}</Text>
            <Text style={[styles.stepText, s.pending && styles.stepTextPending]}>
              {s.label}
            </Text>
          </View>
        ))}

        {/* Limited access notice */}
        <View style={styles.limitCard}>
          <Text style={styles.limitTitle}>⚠️  Limited access while pending</Text>
          <Text style={styles.limitText}>
            You can browse the app and use the Chatbot, but the SOS Emergency button is disabled until your profile is verified.
          </Text>
        </View>

        {/* Action buttons */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => {/* contact hospital logic */}}
          >
            <Text style={styles.secondaryBtnText}>Contact Hospital</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/(auth)/medical-intake')}
          >
            <Text style={styles.secondaryBtnText}>Edit Submission</Text>
          </TouchableOpacity>
        </View>

        {/* Disabled SOS hint */}
        <View style={styles.disabledSosArea}>
          <View style={styles.disabledSosBtn}>
            <Text style={styles.disabledSosIcon}>🔒</Text>
          </View>
          <Text style={styles.disabledSosLabel}>Emergency disabled until verified</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
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
  pendingBadge: {
    backgroundColor: '#2A1F00',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  pendingBadgeText: {
    color: Colors.warning,
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: '#12132A',
    borderWidth: 1.5,
    borderColor: Colors.warning,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  pulseOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 178, 26, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  pulseInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 178, 26, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseIcon: { fontSize: 30 },
  statusTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  statusSub: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11122A',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#2A2B40',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  stepCardPending: { borderColor: Colors.warning },
  stepIcon: { fontSize: 18 },
  stepText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    fontWeight: '500',
  },
  stepTextPending: { color: Colors.warning },
  limitCard: {
    backgroundColor: '#1A1200',
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginVertical: Spacing.md,
  },
  limitTitle: {
    color: Colors.warning,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: 6,
  },
  limitText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  secondaryBtn: {
    flex: 1,
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
  disabledSosArea: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  disabledSosBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A1B2E',
    opacity: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  disabledSosIcon: { fontSize: 28 },
  disabledSosLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
  },
});
