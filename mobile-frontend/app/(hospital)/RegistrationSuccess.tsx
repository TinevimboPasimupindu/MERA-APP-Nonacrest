/**
 * RegistrationSuccess.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * MERA App — "Registration Submitted!" success screen
 *
 * DESIGN:
 *  Hourglass icon in a glowing circle, bold success heading, amber
 *  "Under Review" status, next-steps checklist card, two portal type
 *  cards (Hospital green / Ambulance amber), support link, Return to Home CTA.
 *
 * TEAM NOTES:
 *  - No props required — this is a terminal screen after Step 3 submission.
 *  - "Return to Home" navigates to your main home route (update name below).
 *  - Portal cards can navigate to their respective entry points.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Animated,
  Linking,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

// ─── Navigation Types ─────────────────────────────────────────────────────────
type RootStackParamList = {
  RegistrationSuccess: undefined;
  Home:                undefined;
  HospitalPortal:      undefined;
  AmbulancePortal:     undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'RegistrationSuccess'>;

interface Props {
  navigation?: NavigationProp;
}

// ─── Data Types ───────────────────────────────────────────────────────────────
interface NextStep {
  id:    number;
  icon:  string;
  label: string;
  done:  boolean;
}

interface PortalCardProps {
  emoji:     string;
  label:     string;
  subtitle:  string;
  bg:        string;
  border:    string;
  textColor: string;
  onPress:   () => void;
}

interface StepRowProps {
  icon:  string;
  label: string;
  done:  boolean;
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const theme = {
  colors: {
    bg:            '#0B0F1A',
    surface:       '#131929',
    surfaceBorder: '#1E2A3A',

    iconCircleOuter: '#161D2F',
    iconCircleInner: '#1C2640',

    underReview:   '#E8A020',

    stepIconDone:  '#4CAF50',

    hospitalBg:     '#0E2010',
    hospitalBorder: '#1A4D2E',
    hospitalText:   '#4CAF50',

    ambulanceBg:     '#2A1400',
    ambulanceBorder: '#5C2E00',
    ambulanceText:   '#E8720C',

    btnOutlineBorder: '#1E2A3A',
    btnOutlineText:   '#C9D1D9',

    textPrimary:   '#E6EDF3',
    textSecondary: '#8B949E',
    textMuted:     '#6B7A8D',
    textLink:      '#4CAF50',

    topBorder:     '#1E2A3A',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius:  { sm: 8, md: 12, lg: 16, full: 999 },
  font:    { xs: 11, sm: 13, base: 15, md: 18, lg: 20, xl: 26 },
};

// ─── Static Data ──────────────────────────────────────────────────────────────
const NEXT_STEPS: NextStep[] = [
  { id: 1, icon: '📧', label: "You'll receive a confirmation email",    done: false },
  { id: 2, icon: '🔍', label: 'MERA verifies your documents & license', done: false },
  { id: 3, icon: '✅', label: "Account activated — you'll be notified", done: true  },
  { id: 4, icon: '🚀', label: 'Log in and start using MERA',            done: false },
];

// ─── Animated Hourglass Icon ──────────────────────────────────────────────────
const HourglassIcon: React.FC = () => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.iconOuterCircle}>
      <Animated.View style={[styles.iconInnerCircle, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.iconEmoji}>⏳</Text>
      </Animated.View>
    </View>
  );
};

// ─── Step Row ─────────────────────────────────────────────────────────────────
const StepRow: React.FC<StepRowProps> = ({ icon, label, done }) => (
  <View style={styles.stepRow}>
    <View style={[styles.stepIconBox, done && styles.stepIconBoxDone]}>
      <Text style={styles.stepIcon}>{done ? '✓' : icon}</Text>
    </View>
    <Text style={styles.stepLabel}>{label}</Text>
  </View>
);

// ─── Portal Card ──────────────────────────────────────────────────────────────
const PortalCard: React.FC<PortalCardProps> = ({
  emoji, label, subtitle, bg, border, textColor, onPress,
}) => (
  <TouchableOpacity
    style={[styles.portalCard, { backgroundColor: bg, borderColor: border }]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <Text style={styles.portalEmoji}>{emoji}</Text>
    <Text style={[styles.portalLabel, { color: textColor }]}>{label}</Text>
    <Text style={styles.portalSubtitle}>{subtitle}</Text>
  </TouchableOpacity>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RegistrationSuccess({ navigation }: Props): React.JSX.Element {

  const handleReturnHome = (): void => {
    navigation?.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const handleHospitalPortal = (): void => {
    navigation?.navigate('HospitalPortal');
  };

  const handleAmbulancePortal = (): void => {
    navigation?.navigate('AmbulancePortal');
  };

  const handleSupport = (): void => {
    Linking.openURL('mailto:support@mera.co.za');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.bg} />

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>MERA</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Animated hourglass ── */}
        <HourglassIcon />

        {/* ── Heading ── */}
        <Text style={styles.heading}>Registration Submitted!</Text>
        <Text style={styles.underReview}>Under Review</Text>

        <Text style={styles.bodyText}>
          The MERA team will verify your registration and activate your account
          within 2 business days. You'll receive an email confirmation.
        </Text>

        {/* ── What happens next ── */}
        <View style={styles.nextCard}>
          <Text style={styles.nextCardTitle}>What happens next</Text>
          {NEXT_STEPS.map((step: NextStep) => (
            <StepRow key={step.id} icon={step.icon} label={step.label} done={step.done} />
          ))}
        </View>

        {/* ── Portal cards ── */}
        <View style={styles.portalRow}>
          <PortalCard
            emoji="🏥"
            label="Hospital"
            subtitle={'Access Verify\n& Update portal'}
            bg={theme.colors.hospitalBg}
            border={theme.colors.hospitalBorder}
            textColor={theme.colors.hospitalText}
            onPress={handleHospitalPortal}
          />
          <PortalCard
            emoji="🚑"
            label="Ambulance"
            subtitle={'Receive SOS\ndispatches'}
            bg={theme.colors.ambulanceBg}
            border={theme.colors.ambulanceBorder}
            textColor={theme.colors.ambulanceText}
            onPress={handleAmbulancePortal}
          />
        </View>

        {/* ── Support link ── */}
        <TouchableOpacity onPress={handleSupport} activeOpacity={0.7}>
          <Text style={styles.supportText}>
            Need help?{'  '}
            <Text style={styles.supportLink}>Contact support@mera.co.za</Text>
          </Text>
        </TouchableOpacity>

        {/* ── Return to Home ── */}
        <TouchableOpacity
          style={styles.returnBtn}
          onPress={handleReturnHome}
          activeOpacity={0.8}
        >
          <Text style={styles.returnBtnText}>Return to Home</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  safe:   { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom:     theme.spacing.xl,
    alignItems:        'center',
  },

  // Top bar
  topBar: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.topBorder,
    paddingVertical:   theme.spacing.md,
    alignItems:        'center',
  },
  topBarTitle: {
    fontSize:      theme.font.lg,
    fontWeight:    '700',
    color:         theme.colors.textPrimary,
    letterSpacing: 2,
  },

  // Hourglass
  iconOuterCircle: {
    width:           140,
    height:          140,
    borderRadius:    theme.radius.full,
    backgroundColor: theme.colors.iconCircleOuter,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       theme.spacing.xl,
    marginBottom:    theme.spacing.lg,
  },
  iconInnerCircle: {
    width:           100,
    height:          100,
    borderRadius:    theme.radius.full,
    backgroundColor: theme.colors.iconCircleInner,
    alignItems:      'center',
    justifyContent:  'center',
  },
  iconEmoji: { fontSize: 48 },

  // Heading
  heading: {
    fontSize:      theme.font.xl,
    fontWeight:    '800',
    color:         theme.colors.textPrimary,
    textAlign:     'center',
    marginBottom:  theme.spacing.xs,
    letterSpacing: 0.2,
  },
  underReview: {
    fontSize:      theme.font.sm,
    fontWeight:    '700',
    color:         theme.colors.underReview,
    textAlign:     'center',
    marginBottom:  theme.spacing.md,
    letterSpacing: 0.5,
  },
  bodyText: {
    fontSize:          theme.font.sm,
    color:             theme.colors.textSecondary,
    textAlign:         'center',
    lineHeight:        21,
    marginBottom:      theme.spacing.lg,
    paddingHorizontal: theme.spacing.sm,
  },

  // Next steps card
  nextCard: {
    width:           '100%',
    backgroundColor: theme.colors.surface,
    borderWidth:     1,
    borderColor:     theme.colors.surfaceBorder,
    borderRadius:    theme.radius.md,
    padding:         theme.spacing.md,
    marginBottom:    theme.spacing.md,
    gap:             theme.spacing.sm,
  },
  nextCardTitle: {
    fontSize:     theme.font.base,
    fontWeight:   '700',
    color:        theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  stepRow:      { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  stepIconBox: {
    width:           28,
    height:          28,
    borderRadius:    theme.radius.full,
    backgroundColor: theme.colors.surfaceBorder,
    alignItems:      'center',
    justifyContent:  'center',
  },
  stepIconBoxDone: { backgroundColor: theme.colors.stepIconDone },
  stepIcon:        { fontSize: 13, color: theme.colors.textPrimary },
  stepLabel:       { fontSize: theme.font.sm, color: theme.colors.textSecondary, flex: 1, lineHeight: 18 },

  // Portal cards
  portalRow: {
    flexDirection: 'row',
    gap:           theme.spacing.sm,
    width:         '100%',
    marginBottom:  theme.spacing.md,
  },
  portalCard: {
    flex:         1,
    borderWidth:  1,
    borderRadius: theme.radius.md,
    padding:      theme.spacing.md,
    gap:          4,
  },
  portalEmoji:    { fontSize: 26, marginBottom: 4 },
  portalLabel:    { fontSize: theme.font.base, fontWeight: '700' },
  portalSubtitle: { fontSize: theme.font.xs, color: theme.colors.textSecondary, lineHeight: 17 },

  // Support
  supportText: {
    fontSize:     theme.font.sm,
    color:        theme.colors.textMuted,
    textAlign:    'center',
    marginBottom: theme.spacing.md,
  },
  supportLink: { color: theme.colors.textLink, fontWeight: '600' },

  // Return button
  returnBtn: {
    width:           '100%',
    borderWidth:     1,
    borderColor:     theme.colors.btnOutlineBorder,
    borderRadius:    theme.radius.lg,
    paddingVertical: 15,
    alignItems:      'center',
    backgroundColor: theme.colors.surface,
  },
  returnBtnText: { fontSize: theme.font.base, fontWeight: '600', color: theme.colors.btnOutlineText },
});
