import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  needsReferral?: boolean;
};

const QUICK_ACTIONS = [
  'I feel dizzy',
  'My chest hurts',
  'I need help with my medication',
  'Activate emergency',
];

export default function ChatbotScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [consentChecked, setConsentChecked] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  // Load consent status + past chat history on screen open
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const profile = await apiCall(ENDPOINTS.medicalProfileMe, 'GET', undefined, true);
      setConsentGiven(!!profile.ai_chatbot_consent);
      setConsentChecked(true);
    } catch (err) {
      console.log('Failed to load medical profile for consent check:', err);
      setConsentChecked(true);
    }

    try {
      const history = await apiCall(ENDPOINTS.chatbotHistory, 'GET', undefined, true);
      const loaded: Message[] = history.map((m: any) => ({
        id: m.message_id,
        role: m.role,
        text: m.content,
      }));

      if (loaded.length === 0) {
        loaded.push({
          id: 'welcome',
          role: 'assistant',
          text: "Hi! I'm MERA Assistant. How can I help you today? You can describe your symptoms or ask me a health question.",
        });
      }

      setMessages(loaded);
    } catch (err) {
      console.log('Failed to load chat history:', err);
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: "Hi! I'm MERA Assistant. How can I help you today? You can describe your symptoms or ask me a health question.",
        },
      ]);
    } finally {
      setHistoryLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  };

  const toggleConsent = async () => {
    const newValue = !consentGiven;
    setConsentSaving(true);
    try {
      await apiCall(
        ENDPOINTS.medicalProfileAiChatbotConsent,
        'POST',
        { consent: newValue },
        true
      );
      setConsentGiven(newValue);
    } catch (err) {
      console.log('Failed to update AI chatbot consent:', err);
    } finally {
      setConsentSaving(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const response = await apiCall(
        ENDPOINTS.chatbotMessage,
        'POST',
        { message: text.trim() },
        true
      );

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: response.reply,
        needsReferral: !!response.needs_referral,
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.log('Chatbot message failed:', err);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: "Sorry, I'm having trouble responding right now. Please try again shortly.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push('/(patient)/patient-dashboard')}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>MERA Assistant</Text>
            <View style={styles.onlineRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Online</Text>
            </View>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {/* Consent banner */}
        {consentChecked && !consentGiven && (
          <View style={styles.consentBanner}>
            <Text style={styles.consentText}>
              Allow MERA Assistant to use your medical profile to give more personalised answers? Your messages are not stored  or used to train their AI models.
            </Text>
            <TouchableOpacity
              style={styles.consentButton}
              onPress={toggleConsent}
              disabled={consentSaving}
            >
              {consentSaving ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.consentButtonText}>Allow</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {consentChecked && consentGiven && (
          <TouchableOpacity style={styles.consentActiveBanner} onPress={toggleConsent}>
            <Text style={styles.consentActiveText}>
              ✓ Using your medical profile for personalised answers — tap to turn off
            </Text>
          </TouchableOpacity>
        )}

        {/* Messages */}
        {historyLoading ? (
          <View style={styles.loadingScreen}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Spacing.md }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((m) => (
              <View key={m.id}>
                <View
                  style={[
                    styles.bubble,
                    m.role === 'user' ? styles.bubbleUser : styles.bubbleBot,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      m.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextBot,
                    ]}
                  >
                    {m.text}
                  </Text>
                </View>

                {m.needsReferral && (
                  <View style={styles.referralBanner}>
                    <Text style={styles.referralText}>
                      ⚠️ This is general information only. Please consult a healthcare
                      professional for diagnosis or treatment.
                    </Text>
                  </View>
                )}
              </View>
            ))}

            {loading && (
              <View style={[styles.bubble, styles.bubbleBot, styles.loadingBubble]}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.typingText}>MERA is typing...</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Quick actions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRow}
          contentContainerStyle={{ paddingHorizontal: Spacing.md }}
        >
          {QUICK_ACTIONS.map((q) => (
            <TouchableOpacity
              key={q}
              style={[
                styles.quickChip,
                q === 'Activate emergency' && styles.quickChipEmergency,
              ]}
              onPress={() => {
                if (q === 'Activate emergency') {
                  router.push('/(patient)/patient-dashboard');
                } else {
                  sendMessage(q);
                }
              }}
            >
              <Text
                style={[
                  styles.quickChipText,
                  q === 'Activate emergency' && styles.quickChipTextEmergency,
                ]}
              >
                {q}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={Colors.textSecondary}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
    borderBottomWidth: 1,
    borderBottomColor: '#2A2B40',
  },
  backText: { color: Colors.textSecondary, fontSize: FontSizes.xl },
  headerCenter: { alignItems: 'center' },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.md, fontWeight: '700' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  onlineText: { color: Colors.success, fontSize: FontSizes.xs },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  consentBanner: {
    backgroundColor: '#2A2410',
    borderWidth: 1,
    borderColor: '#5A4A10',
    borderRadius: BorderRadius.md,
    margin: Spacing.md,
    padding: Spacing.md,
  },
  consentText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.xs,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  consentButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  consentButtonText: { color: Colors.white, fontWeight: '600', fontSize: FontSizes.sm },
  consentActiveBanner: {
    backgroundColor: '#0F1F14',
    borderWidth: 1,
    borderColor: '#1F4A2A',
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
  },
  consentActiveText: { color: Colors.success, fontSize: FontSizes.xs },
  messages: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  bubbleBot: {
    alignSelf: 'flex-start',
    backgroundColor: '#11122A',
    borderWidth: 1,
    borderColor: '#2A2B40',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#162850',
  },
  bubbleText: { fontSize: FontSizes.sm, lineHeight: 20 },
  bubbleTextBot: { color: Colors.textPrimary },
  bubbleTextUser: { color: Colors.white },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  typingText: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  referralBanner: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
    backgroundColor: '#2A2410',
    borderWidth: 1,
    borderColor: '#5A4A10',
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    marginTop: -Spacing.sm,
  },
  referralText: { color: '#E0C060', fontSize: FontSizes.xs, lineHeight: 16 },
  quickRow: {
    maxHeight: 52,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#1A1B2E',
  },
  quickChip: {
    backgroundColor: '#11122A',
    borderWidth: 1,
    borderColor: '#2A2B40',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
  },
  quickChipEmergency: {
    backgroundColor: '#1A0404',
    borderColor: Colors.danger,
  },
  quickChipText: { color: Colors.textSecondary, fontSize: FontSizes.xs },
  quickChipTextEmergency: { color: Colors.danger, fontWeight: '600' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#2A2B40',
    gap: Spacing.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#11122A',
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: Colors.white, fontSize: FontSizes.md },
});