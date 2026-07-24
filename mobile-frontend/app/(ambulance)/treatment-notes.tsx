import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';

import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { Colors, Spacing } from '../../constants/theme';
import { apiCall } from '../../services/api';

export default function TreatmentNotes() {
  const router = useRouter();
  const { incidentId } = useLocalSearchParams<{ incidentId: string }>();

  const [chiefComplaint, setChiefComplaint] = useState('');
  const [treatment, setTreatment] = useState('');
  const [vitals, setVitals] = useState('');
  const [medications, setMedications] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
  });

  if (!fontsLoaded) return null;

  const handleSubmit = async () => {
    if (!chiefComplaint || !treatment) {
      Alert.alert('Required Fields', 'Please fill in the chief complaint and treatment administered before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      await apiCall(`/incidents/${incidentId}/treatment_notes/`, 'POST', {
        chief_complaint: chiefComplaint,
        treatment_administered: treatment,
        blood_pressure: vitals,
        spo2: '',
        heart_rate: '',
        medications_given: medications,
        additional_notes: additionalNotes,
        is_draft: false,
      }, true);

      Alert.alert(
        'Notes Submitted',
        'Treatment notes have been sent to the hospital and stored in the patient\'s emergency history.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: any) {
      console.log('Treatment notes error:', JSON.stringify(err));
      Alert.alert('Submission Failed', err.detail || 'Could not submit notes. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      await apiCall(`/incidents/${incidentId}/treatment_notes/`, 'POST', {
        chief_complaint: chiefComplaint,
        treatment_administered: treatment,
        blood_pressure: vitals,
        spo2: '',
        heart_rate: '',
        medications_given: medications,
        additional_notes: additionalNotes,
        is_draft: true,
      }, true);

      Alert.alert('Draft Saved', 'Your notes have been saved locally. You can complete and submit later.');
    } catch (err: any) {
      console.log('Draft save error:', JSON.stringify(err));
    } finally {
      setSavingDraft(false);
    }
  };

  return (
    <View style={styles.screen}>

      {/* Sticky Header */}
      <View style={styles.stickyHeader}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.heading}>Treatment Notes</Text>
        <Text style={styles.subHeading}>
          Incident #{incidentId?.slice(0, 8)}
        </Text>
        <View style={styles.headerDivider} />
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >

        <Text style={styles.infoText}>
          Capture what was done on scene. This will be sent to the hospital and stored in the patient's emergency history.
        </Text>

        {/* Chief Complaint */}
        <Text style={styles.label}>CHIEF COMPLAINT / PRESENTING CONDITION *</Text>
        <TextInput
          style={styles.textArea}
          placeholder="e.g. Patient found unresponsive. Suspected hypoglycaemia."
          placeholderTextColor={Colors.textSecondary}
          value={chiefComplaint}
          onChangeText={setChiefComplaint}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Treatment Administered */}
        <Text style={styles.label}>TREATMENT ADMINISTERED *</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Add treatment steps..."
          placeholderTextColor={Colors.textSecondary}
          value={treatment}
          onChangeText={setTreatment}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Vital Signs */}
        <Text style={styles.label}>VITAL SIGNS ON ARRIVAL</Text>
        <TextInput
          style={styles.textArea}
          placeholder="BP: 120/80, SpO2: 98%, HR: 72bpm"
          placeholderTextColor={Colors.textSecondary}
          value={vitals}
          onChangeText={setVitals}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Medications Given */}
        <Text style={styles.label}>MEDICATIONS GIVEN</Text>
        <TextInput
          style={styles.textArea}
          placeholder="e.g. Oxygen 15L, Dextrose 50ml IV"
          placeholderTextColor={Colors.textSecondary}
          value={medications}
          onChangeText={setMedications}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Additional Notes */}
        <Text style={styles.label}>ADDITIONAL NOTES</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Any observations for the hospital team..."
          placeholderTextColor={Colors.textSecondary}
          value={additionalNotes}
          onChangeText={setAdditionalNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>
              Submit Notes to Hospital & Patient
            </Text>
          )}
        </TouchableOpacity>

        

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  stickyHeader: {
    backgroundColor: '#1A0000',
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 16,
    zIndex: 10,
  },
  backArrow: {
    color: Colors.emergency,
    fontSize: 22,
    marginBottom: 8,
  },
  heading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: Colors.textPrimary,
  },
  subHeading: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#2A0000',
    marginTop: 16,
  },
  scroll: { flex: 1 },
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 80,
  },
  infoText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  label: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 2,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  textArea: {
    backgroundColor: '#1A1D35',
    borderWidth: 1,
    borderColor: '#2A2D45',
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: 'Inter_400Regular',
    marginBottom: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: Colors.white,
  },
  saveDraftButton: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  saveDraftText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: Colors.textSecondary,
  },
});