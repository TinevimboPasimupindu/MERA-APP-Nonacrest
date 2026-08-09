import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';

// A paragraph is either a plain string, or a list of segments where some
// are bolded — used for the handful of sentences in the source content
// that call out an important safety point in bold.
type Segment = { text: string; bold?: boolean };
type Paragraph = string | Segment[];

type Section = {
  heading: string;
  paragraphs: Paragraph[];
  bullets?: Paragraph[];
};

const LAST_UPDATED = '9/8/2026';

const SECTIONS: Section[] = [
  {
    heading: '1. Acceptance of Terms',
    paragraphs: [
      "By registering for and using the MERA (Medical Emergency Response Application) platform — including the mobile application and any associated web portals — you agree to be bound by these Terms and Conditions. If you do not agree, you may not use MERA.",
    ],
  },
  {
    heading: '2. What MERA Is (and Is Not)',
    paragraphs: [
      "MERA is a platform that helps connect patients experiencing a medical emergency with nearby ambulance services and hospitals, and allows patients to store medical information that can be shared with emergency responders during an active incident.",
      [
        { text: "MERA is not a replacement for South Africa's national emergency services.", bold: true },
        { text: " In a life-threatening emergency, you should still be aware of and, where appropriate, use official emergency numbers. MERA aims to supplement, not replace, existing emergency response systems." },
      ],
      [
        { text: "MERA's AI health chatbot does not provide medical diagnoses or prescribe treatment.", bold: true },
        { text: " It offers general health information only and will direct you to consult a qualified healthcare professional for anything requiring medical judgment. In an emergency, use the SOS feature rather than the chatbot." },
      ],
    ],
  },
  {
    heading: '3. Accounts and Roles',
    paragraphs: [
      "MERA has several account types: Patient, Hospital Administrator, Ambulance Service Administrator, EMT (Emergency Medical Technician), and MERA Platform Administrator. Only Patient accounts are self-registered; all other account types are created and managed by an authorised administrator.",
      "You are responsible for keeping your login credentials confidential and for all activity that occurs under your account.",
    ],
  },
  {
    heading: '4. Medical Information You Provide',
    paragraphs: [
      "As a Patient, you may submit medical information (such as blood type, chronic conditions, medications, and allergies) to your account. You are responsible for the accuracy of the information you provide. Inaccurate or outdated medical information could affect the quality of care you receive during an emergency.",
      "You may update your medical information at any time. Certain updates may require review by a healthcare facility before being marked as verified.",
    ],
  },
  {
    heading: '5. Consent and Data Sharing',
    paragraphs: [
      "MERA processes your personal information, including sensitive medical information, in accordance with South Africa's Protection of Personal Information Act (POPIA).",
      "We ask for your separate, explicit consent for two distinct purposes:",
    ],
    bullets: [
      [
        { text: 'Sharing your medical profile with hospitals and ambulance services', bold: true },
        { text: ' during an active emergency, so responders can make informed treatment decisions.' },
      ],
      [
        { text: 'Allowing our AI health chatbot to use your medical profile', bold: true },
        { text: ' as context when answering your questions. You may use MERA without granting this consent; the chatbot will simply respond with general information rather than information tailored to your profile.' },
      ],
    ],
  },
  {
    heading: '',
    paragraphs: [
      "You may withdraw either consent at any time through your account settings. Withdrawing consent does not delete previously shared data held by a hospital or ambulance service you have already interacted with.",
    ],
  },
  {
    heading: '6. AI Health Chatbot',
    paragraphs: [
      "MERA's chatbot is powered by a third-party AI service. Your conversations with the chatbot may be processed by that service in order to generate a response, but your conversation content is not used to train that provider's underlying models, and is not retained by the provider beyond what is necessary to generate a response. See our full Privacy Policy for further detail on how chatbot data is handled.",
      "The chatbot will recommend you consult a healthcare professional for any concern requiring diagnosis or treatment, and will never attempt to independently trigger an emergency alert on your behalf.",
    ],
  },
  {
    heading: '7. Location Data',
    paragraphs: [
      "When you trigger an SOS alert, MERA captures and shares your real-time GPS location with responding emergency services and, where enabled, with your registered emergency contacts, so that help can reach you. If you are an EMT actively responding to an incident, your live location is shared with the patient you are responding to for the duration of that incident, so they can see help approaching.",
    ],
  },
  {
    heading: '8. Service Availability',
    paragraphs: [
      [
        { text: 'MERA is provided on an "as available" basis. While we aim for high reliability, we cannot guarantee uninterrupted access, and technical issues, network conditions, or third-party service outages (including mapping and AI services MERA depends on) may affect functionality at any time. ' },
        { text: 'MERA should not be relied upon as your sole means of summoning emergency assistance.', bold: true },
      ],
    ],
  },
  {
    heading: '9. Limitation of Liability',
    paragraphs: [
      "To the fullest extent permitted by law, MERA and its operators are not liable for any injury, loss, or damage arising from your use of, or inability to use, the platform, including but not limited to delays in emergency response, inaccuracies in medical information you have provided, or technical failures.",
    ],
  },
  {
    heading: '10. Institutional Accounts',
    paragraphs: [
      "Hospitals and ambulance services accessing MERA through an administrator account are responsible for the accuracy of information they enter, including patient records they are authorised to update, and for ensuring that only authorised personnel have access to their MERA account and any accounts (such as EMT accounts) created under it.",
    ],
  },
  {
    heading: '11. Account Suspension and Termination',
    paragraphs: [
      "MERA may suspend or deactivate any account that violates these Terms, provides fraudulent information, or misuses the platform (including false SOS activations). Patients may request deletion of their account and associated data at any time, subject to any records MERA is legally required to retain.",
    ],
  },
  {
    heading: '12. Changes to These Terms',
    paragraphs: [
      "We may update these Terms from time to time. Continued use of MERA after changes take effect constitutes acceptance of the updated Terms.",
    ],
  },
  {
    heading: '13. Contact',
    paragraphs: [
      "Questions about these Terms can be directed to [CONTACT EMAIL/DETAILS].",
    ],
  },
];

const DISCLAIMER =
  "This document is a draft placeholder prepared for a student capstone project prototype. It reflects MERA's actual features and data-handling practices as currently implemented but has not been reviewed by legal counsel and is not suitable for real-world deployment without proper legal review.";

function ParagraphText({ paragraph, style }: { paragraph: Paragraph; style: any }) {
  if (typeof paragraph === 'string') {
    return <Text style={style}>{paragraph}</Text>;
  }
  return (
    <Text style={style}>
      {paragraph.map((seg, i) => (
        <Text key={i} style={seg.bold ? styles.bold : undefined}>
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

export default function TermsAndConditionsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)' as any))}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Conditions</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.docTitle}>MERA — Terms and Conditions</Text>
        <Text style={styles.lastUpdated}>Last updated: {LAST_UPDATED}</Text>

        {SECTIONS.map((section, i) => (
          <View key={i} style={styles.section}>
            {section.heading ? <Text style={styles.sectionHeading}>{section.heading}</Text> : null}
            {section.paragraphs.map((p, j) => (
              <ParagraphText key={j} paragraph={p} style={styles.paragraph} />
            ))}
            {section.bullets?.map((b, j) => (
              <View key={j} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <ParagraphText paragraph={b} style={styles.bulletText} />
              </View>
            ))}
          </View>
        ))}

        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>{DISCLAIMER}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  backText: { color: Colors.textSecondary, fontSize: FontSizes.xl },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: '700' },
  scroll: { flex: 1, paddingHorizontal: Spacing.md },
  container: { paddingBottom: Spacing.xl },
  docTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.xxl,
    fontWeight: '700',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  lastUpdated: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeading: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  paragraph: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    lineHeight: 21,
    marginBottom: Spacing.sm,
  },
  bold: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  bulletDot: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    marginRight: Spacing.sm,
    lineHeight: 21,
  },
  bulletText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    lineHeight: 21,
  },
  disclaimerBox: {
    backgroundColor: '#11122A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  disclaimerText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
