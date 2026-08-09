import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS, clearTokens, getToken } from '../../services/api';

type ThemeOption = 'dark' | 'light' | 'system';

export default function SettingsScreen() {
  const [theme, setTheme] = useState<ThemeOption>('dark');
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [user, setUser] = useState<any>(null);

  const themeLabel = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System';

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await apiCall(ENDPOINTS.me, 'GET', undefined, true);
        setUser(data);
      } catch (err) {
        console.log('Error fetching user:', err);
      }
    };
    fetchUser();
  }, []);

  const getInitials = (name: string) => {
    if (!name) return 'ME';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of MERA?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await clearTokens();
            router.replace('/(auth)/login' as any);
          },
        },
      ]
    );
  };

  const SettingsRow = ({
    icon,
    iconBg,
    label,
    sub,
    right,
    onPress,
    danger,
  }: {
    icon: string;
    iconBg: string;
    label: string;
    sub?: string;
    right?: React.ReactNode;
    onPress?: () => void;
    danger?: boolean;
  }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
        <Text style={styles.rowIconText}>{icon}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {right ?? <Text style={styles.chevron}>›</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Profile card */}
        <TouchableOpacity style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {getInitials(user?.display_name || 'ME')}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.display_name || 'Loading...'}
            </Text>
            <Text style={styles.profileSub}>
              {user?.role === 'patient' ? 'Patient' : user?.role || 'User'}
            </Text>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓  Verified</Text>
            </View>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        {/* Appearance */}
        <Text style={styles.sectionLabel}>APPEARANCE</Text>
        <SettingsRow
          icon="🎨"
          iconBg="#0D1230"
          label="Theme"
          sub={`${themeLabel} mode is active`}
          right={
            <View style={styles.themeBadge}>
              <Text style={styles.themeBadgeText}>{themeLabel}</Text>
            </View>
          }
          onPress={() => setShowThemePicker(true)}
        />

        {/* Account */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <SettingsRow icon="👤" iconBg="#0D1230" label="Edit Profile" onPress={() => {}} />
        <SettingsRow icon="🔒" iconBg="#0D1230" label="Change Password" onPress={() => {}} />
        <SettingsRow icon="🔔" iconBg="#0D1230" label="Notification Preferences" onPress={() => {}} />

        {/* My Health */}
        <Text style={styles.sectionLabel}>MY HEALTH</Text>
        <SettingsRow
          icon="📜"
          iconBg="#0A1A0A"
          label="Emergency History"
          sub="View your past emergency records"
          onPress={() => router.push('/(patient)/emergency-history' as any)}
        />

        {/* Support & Legal */}
        <Text style={styles.sectionLabel}>SUPPORT & LEGAL</Text>
        <SettingsRow icon="❓" iconBg="#12121E" label="FAQs" sub="Frequently asked questions" onPress={() => {}} />
        <SettingsRow
          icon="📜"
          iconBg="#12121E"
          label="Terms & Conditions"
          sub="Terms of use, and how MERA handles your data"
          onPress={() => router.push('/(auth)/terms-and-conditions' as any)}
        />
        {/* Same destination as Terms & Conditions above — this is a
            combined document covering both, see PROJECT_CONTEXT.md. Kept
            as its own row since "Privacy Policy" is still the label a
            patient is likely to look for specifically. */}
        <SettingsRow
          icon="🔏"
          iconBg="#12121E"
          label="Privacy Policy"
          sub="How MERA handles your data"
          onPress={() => router.push('/(auth)/terms-and-conditions' as any)}
        />
        <SettingsRow icon="💬" iconBg="#12121E" label="Contact Support" sub="Get help from the MERA team" onPress={() => {}} />

        {/* Log out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>🚪  Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MERA v4.0.1  •  © 2025 NONACREST</Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Theme picker modal */}
      <Modal visible={showThemePicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Theme</Text>
            <Text style={styles.modalSub}>Choose how MERA looks on your device.</Text>

            {([
              { key: 'dark', label: 'Dark Mode', desc: 'Deep navy background — easier on the eyes at night.' },
              { key: 'light', label: 'Light Mode', desc: 'White and grey background — clear in bright conditions.' },
              { key: 'system', label: 'Use System Default', desc: "Follows your phone's appearance setting automatically." },
            ] as { key: ThemeOption; label: string; desc: string }[]).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.themeOption, theme === opt.key && styles.themeOptionSelected]}
                onPress={() => {
                  setTheme(opt.key);
                  setShowThemePicker(false);
                }}
              >
                <View style={styles.themeOptionContent}>
                  <Text style={styles.themeOptionLabel}>{opt.label}</Text>
                  <Text style={styles.themeOptionDesc}>{opt.desc}</Text>
                </View>
                <View style={[
                  styles.radioCircle,
                  theme === opt.key && styles.radioCircleSelected,
                ]}>
                  {theme === opt.key && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowThemePicker(false)}
            >
              <Text style={styles.modalCloseBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  backText: { color: Colors.textSecondary, fontSize: FontSizes.xl },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: '700' },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11122A',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#2A2B40',
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#162038',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.primary, fontSize: FontSizes.lg, fontWeight: '700' },
  profileInfo: { flex: 1 },
  profileName: { color: Colors.textPrimary, fontSize: FontSizes.md, fontWeight: '700', marginBottom: 2 },
  profileSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginBottom: 6 },
  verifiedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0A2010',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  verifiedText: { color: Colors.success, fontSize: FontSizes.xs, fontWeight: '600' },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  row: {
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
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconText: { fontSize: 18 },
  rowContent: { flex: 1 },
  rowLabel: { color: Colors.textPrimary, fontSize: FontSizes.sm, fontWeight: '600' },
  rowLabelDanger: { color: Colors.danger },
  rowSub: { color: Colors.textSecondary, fontSize: FontSizes.xs, marginTop: 2 },
  chevron: { color: Colors.textSecondary, fontSize: FontSizes.xl },
  themeBadge: {
    backgroundColor: '#0D1B3E',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  themeBadgeText: { color: Colors.primary, fontSize: FontSizes.xs, fontWeight: '600' },
  logoutBtn: {
    backgroundColor: '#1A0404',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  logoutText: { color: Colors.danger, fontSize: FontSizes.md, fontWeight: '600' },
  version: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#11122A',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSub: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginBottom: Spacing.lg,
  },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0E1A',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#2A2B40',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  themeOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#0D1B3E',
  },
  themeOptionContent: { flex: 1 },
  themeOptionLabel: {
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: 4,
  },
  themeOptionDesc: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    lineHeight: 18,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#2A2B40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: { borderColor: Colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  modalCloseBtn: {
    backgroundColor: '#1A1B2E',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  modalCloseBtnText: { color: Colors.textSecondary, fontSize: FontSizes.sm, fontWeight: '600' },
});