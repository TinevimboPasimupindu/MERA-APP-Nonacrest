import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
  Alert,
} from 'react-native';

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors, FontSizes, Spacing } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';

export default function PatientDashboardScreen() {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const triggerSOS = async () => {
    setTriggering(true);
    try {
      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      let latitude = null;
      let longitude = null;

      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        latitude = parseFloat(location.coords.latitude.toFixed(6));
        longitude = parseFloat(location.coords.longitude.toFixed(6));
      }

      // Trigger SOS on backend
      const data = await apiCall(
        ENDPOINTS.triggerSOS,
        'POST',
        {
          latitude,
          longitude,
          priority_level: 'high',
        },
        true
      );

      // Auto-confirm immediately
        await apiCall(`/incidents/${data.id}/confirm/`, 'POST', {
          activation_method: 'manual',
        }, true);

      // Navigate to emergency active screen with incident ID
      router.push({
        pathname: '/(patient)/emergency-active' as any,
        params: { incidentId: data.id },
      });

    } catch (err: any) {
      console.log('SOS error:', err);
      Alert.alert(
        'SOS Failed',
        err.detail || 'Could not trigger emergency. Please try again or call 10177.',
        [{ text: 'OK' }]
      );
    } finally {
      setTriggering(false);
    }
  };

  const startHold = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.93,
      duration: 120,
      useNativeDriver: true,
    }).start();

    holdTimer.current = setTimeout(() => {
      triggerSOS();
    }, 1500);
  };

  const endHold = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 120,
      useNativeDriver: true,
    }).start();

    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={Colors.background}
      />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>MERA</Text>
          <Text style={styles.greeting}>Hello, Sarah</Text>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.safeBadge}>
            <View style={styles.safeDot} />
            <Text style={styles.safeBadgeText}>Safe</Text>
          </View>

          <TouchableOpacity
            style={styles.menuBtn}
            onPress={() => router.push('/(patient)/settings')}
          >
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
            <View style={styles.menuLine} />
          </TouchableOpacity>
        </View>
      </View>

      {/* BODY */}
      <View style={styles.body}>
        <Animated.View
          style={[
            styles.pulseRing3,
            { transform: [{ scale: pulseAnim }] },
          ]}
        />

        <View style={styles.pulseRing2} />
        <View style={styles.pulseRing1} />

        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={[styles.sosBtn, triggering && styles.sosBtnTriggering]}
            onPressIn={startHold}
            onPressOut={endHold}
            activeOpacity={1}
            disabled={triggering}
          >
            <Text style={styles.sosLabel}>
              {triggering ? 'SENDING...' : 'EMERGENCY'}
            </Text>
            <Text style={styles.sosSubLabel}>
              {triggering ? 'Please wait' : 'Hold to activate'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.sosHint}>
          Tap & hold the button to trigger emergency
        </Text>
      </View>

      {/* BOTTOM NAVIGATION */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/(patient)/patient-dashboard' as any)}
        >
          <Ionicons name="home" size={28} color="#FF6B35" />
          <Text style={styles.navTextActive}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/(patient)/emergency-contacts' as any)}
        >
          <Ionicons name="people-outline" size={28} color="#B8B8C7" />
          <Text style={styles.navText}>Contacts</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/(patient)/chatbot' as any)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={28} color="#B8B8C7" />
          <Text style={styles.navText}>AI Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => router.push('/(patient)/medical-profile' as any)}
        >
          <Ionicons name="person-outline" size={28} color="#B8B8C7" />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: FontSizes.xxl,
    fontWeight: '800',
  },
  greeting: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  safeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A2010',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  safeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  safeBadgeText: {
    color: Colors.success,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  menuBtn: {
    gap: 4,
    padding: 6,
  },
  menuLine: {
    width: 22,
    height: 2,
    backgroundColor: Colors.textPrimary,
    borderRadius: 2,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing3: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(180, 20, 20, 0.12)',
  },
  pulseRing2: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(180, 20, 20, 0.18)',
  },
  pulseRing1: {
    position: 'absolute',
    width: 185,
    height: 185,
    borderRadius: 93,
    backgroundColor: 'rgba(180, 20, 20, 0.25)',
  },
  sosBtn: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#CC1111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosBtnTriggering: {
    backgroundColor: '#991717',
    opacity: 0.8,
  },
  sosLabel: {
    color: '#fff',
    fontSize: FontSizes.lg,
    fontWeight: '800',
  },
  sosSubLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FontSizes.xs,
    marginTop: 4,
  },
  sosHint: {
    position: 'absolute',
    bottom: 40,
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#3F3F5A',
    marginHorizontal: 12,
    marginBottom: 16,
    borderRadius: 32,
    paddingVertical: 18,
    paddingHorizontal: 10,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 75,
  },
  navText: {
    color: '#B8B8C7',
    fontSize: 12,
    marginTop: 6,
  },
  navTextActive: {
    color: '#FF6B35',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '700',
  },
});