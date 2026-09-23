import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Animated,
  Alert,
  AppState,
  AppStateStatus,
  Modal,
  Linking,
} from 'react-native';

import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors, FontSizes, Spacing } from '../../constants/theme';
import { apiCall, ENDPOINTS } from '../../services/api';
import HouseAdsBanner from '../../components/house-ads-banner';
import { getSosLocation, SosLocationFailure } from '../../utils/get-sos-location';
import { newDebugId, debugMount, debugUnmount, debugLog } from '../../utils/debug-instances'; // [DBG]

// How often to check for a newly-active incident while the patient is
// sitting on this dashboard — same visibility-aware reasoning as the web
// app's IncomingAmbulances.jsx polling (see PROJECT_CONTEXT.md): a bystander
// could trigger an SOS on this patient's behalf via their NFC tag at any
// moment, with nothing else on this screen to surface it. RN's equivalent
// of the web's document.visibilitychange is AppState.
const ACTIVE_INCIDENT_POLL_MS = 15000;

export default function PatientDashboardScreen() {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [user, setUser] = useState<any>(null);

  // [DBG] identify this instance + log mount/unmount (see utils/debug-instances.ts)
  const dbgId = useRef(newDebugId()).current;
  useEffect(() => {
    debugMount('Dashboard', dbgId);
    return () => debugUnmount('Dashboard', dbgId);
  }, [dbgId]);

  // Set when the SOS trigger was BLOCKED because no location could be
  // obtained (see triggerSOS) — drives the calm "we need your location"
  // modal below. null = nothing to show.
  const [locationIssue, setLocationIssue] = useState<SosLocationFailure | null>(null);

  // The most recently seen active-incident id, so the poll below only
  // navigates on a NEWLY-appeared incident, not on re-seeing the same one
  // every 15s. Also set directly by this screen's own triggerSOS() so a
  // patient's manual SOS (which already navigates immediately below)
  // doesn't get double-navigated by the next poll tick landing moments
  // later.
  const lastActiveIncidentIdRef = useRef<string | null>(null);

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

  const firstName = user?.full_name?.trim().split(/\s+/)[0] || 'there';

  // Ask for location permission as soon as the dashboard loads, so the OS
  // prompt is out of the way BEFORE an emergency rather than appearing in
  // the middle of one (previously it was only ever requested inside
  // triggerSOS, after the hold completed). Deliberately non-blocking and
  // silent on denial: the dashboard stays fully usable either way, and
  // triggerSOS re-checks (and blocks with a clear message) if it's still
  // missing when it matters. requestForegroundPermissionsAsync doesn't
  // re-prompt once the user has answered, so this is cheap on later loads.
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch((err) =>
      console.log('Location permission request failed:', err)
    );
  }, []);

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

  // Foreground-only active-incident polling. Previously nothing on this
  // screen ever called GET /incidents/my_active/ at all — that endpoint
  // was only ever hit from route-after-auth.ts, at app launch or right
  // after login (see PROJECT_CONTEXT.md). A patient sitting on this
  // dashboard with the app already open had no way to learn about a new
  // incident short of manually reloading the app, which is exactly the
  // scenario an NFC-tag bystander trigger needs to reach them through.
  //
  // Mirrors the web app's visibility-aware IncomingAmbulances.jsx pattern
  // (see PROJECT_CONTEXT.md): stopped outright while the app is
  // backgrounded rather than left to whatever the OS does with a free-
  // running timer, and refreshed immediately (not just resumed) the moment
  // the app comes back to the foreground, since the last-known state is
  // presumed stale by whatever length of time it was away. AppState is
  // RN's equivalent of the web's document.visibilitychange.
  //
  // Gated on screen FOCUS (useFocusEffect), not just mount: this screen is
  // in a Stack, which keeps every screen beneath the top one mounted — so a
  // plain useEffect kept polling (and, on a new incident, kept calling
  // router.push) from dashboards hidden behind emergency-active, stacking
  // duplicate navigations and slide animations. useFocusEffect runs the
  // setup when this screen becomes the focused one and the cleanup when
  // it loses focus or unmounts, and re-polls immediately on regaining focus.
  useFocusEffect(useCallback(() => {
    debugLog(`Dashboard#${dbgId} FOCUS-EFFECT RUN (screen focused; appState=${AppState.currentState})`); // [DBG]
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      debugLog(`Dashboard#${dbgId} poll tick`); // [DBG]
      try {
        const data = await apiCall(ENDPOINTS.myActiveIncident, 'GET', undefined, true);
        if (cancelled) return;
        const active = data?.active_incident;
        debugLog(`Dashboard#${dbgId} poll result: active=${active ? active.id : 'none'} lastSeen=${lastActiveIncidentIdRef.current}`); // [DBG]
        if (active) {
          if (lastActiveIncidentIdRef.current !== active.id) {
            lastActiveIncidentIdRef.current = active.id;
            debugLog(`Dashboard#${dbgId} POLL PUSHING emergency-active for ${active.id}`); // [DBG]
            // Covers both a genuinely new incident appearing AND an
            // already-active one found on this screen's very first poll
            // (e.g. the dashboard somehow being reached while one is
            // already in progress) — either way, the dashboard shouldn't
            // stay showing while an emergency is active. The NFC banner
            // itself lives on emergency-active.tsx, driven off the
            // incident's own activation_method field (already included
            // in this response) rather than a param passed here — so it
            // shows correctly regardless of how this screen was reached.
            router.push({
              pathname: '/(patient)/emergency-active' as any,
              // fromDashboard: tells emergency-active a dashboard is beneath
              // it, so it can dismissTo() back instead of stacking another.
              params: { incidentId: active.id, fromDashboard: '1' },
            });
          }
        } else {
          lastActiveIncidentIdRef.current = null;
        }
      } catch (err) {
        console.log('Active-incident poll failed:', err);
      }
    };

    const startPolling = () => {
      if (interval) {
        debugLog(`Dashboard#${dbgId} startPolling ignored (already polling)`); // [DBG]
        return;
      }
      debugLog(`Dashboard#${dbgId} POLLING STARTED (every ${ACTIVE_INCIDENT_POLL_MS}ms)`); // [DBG]
      poll();
      interval = setInterval(poll, ACTIVE_INCIDENT_POLL_MS);
    };

    const stopPolling = () => {
      if (interval) {
        debugLog(`Dashboard#${dbgId} POLLING STOPPED`); // [DBG]
        clearInterval(interval);
        interval = null;
      }
    };

    if (AppState.currentState === 'active') {
      startPolling();
    }

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      debugLog(`Dashboard#${dbgId} FOCUS-EFFECT CLEANUP (blur or unmount)`); // [DBG]
      cancelled = true;
      stopPolling();
      subscription.remove();
    };
  }, []));

  const triggerSOS = async () => {
    setTriggering(true);
    try {
      // A location is REQUIRED — no incident is created without one (the
      // backend now rejects it too). getSosLocation tries permission, then
      // a fresh fix capped at a few seconds, then the last-known position;
      // if all of that yields nothing we stop HERE and show the calm
      // "we need your location" state with a retry, rather than triggering
      // location-less or showing the generic "SOS Failed" alert.
      const loc = await getSosLocation(Location);
      if (!loc.ok) {
        setLocationIssue(loc.reason);
        return;
      }

      // Trigger SOS on backend
      const data = await apiCall(
        ENDPOINTS.triggerSOS,
        'POST',
        {
          latitude: loc.latitude,
          longitude: loc.longitude,
          location_accuracy_metres: loc.accuracy,
          priority_level: 'high',
        },
        true
      );

      // Auto-confirm immediately
        await apiCall(`/incidents/${data.id}/confirm/`, 'POST', {
          activation_method: 'manual',
        }, true);

      // Record this as the last-seen active incident BEFORE navigating —
      // the active-incident poll below runs every 15s regardless of this
      // navigation, and without this it could land moments later, see the
      // same incident as "new" (it hasn't seen it yet), and fire a second,
      // redundant navigation on top of this one.
      lastActiveIncidentIdRef.current = data.id;
      debugLog(`Dashboard#${dbgId} MANUAL TRIGGER PUSHING emergency-active for ${data.id}`); // [DBG]

      // Navigate to emergency active screen with incident ID
      router.push({
        pathname: '/(patient)/emergency-active' as any,
        params: { incidentId: data.id, fromDashboard: '1' },
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
          <Text style={styles.greeting}>Hello, {firstName}</Text>
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

      {/* House ads — small, secondary sponsor banner for the team's
          monetization/sustainability business case (see
          constants/house-ads.ts). Deliberately placed here, between the
          header and the SOS button's own centered area, so it never
          crowds or competes with the emergency button itself — and only
          ever rendered on this screen, never on any emergency-flow
          screen. */}
      <HouseAdsBanner />

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
          onPress={() => router.navigate('/(patient)/patient-dashboard' as any)}
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

      {/* Shown when the SOS trigger was BLOCKED for lack of a location (see
          triggerSOS). Calm and instructional rather than an error alert; no
          incident has been created at this point. "Try again" re-runs the
          whole location-then-trigger attempt. */}
      <Modal
        visible={locationIssue !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLocationIssue(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Ionicons name="location-outline" size={34} color={Colors.warning} />
            <Text style={styles.modalTitle}>We need your location to send help</Text>
            <Text style={styles.modalBody}>
              MERA can only send an ambulance if it knows where you are.{' '}
              {locationIssue === 'permission_denied'
                ? 'Location access is turned off for MERA. Open Settings and allow location for MERA ("While Using the App"), then try again.'
                : 'We couldn’t get a location fix. Make sure Location Services / GPS is turned on in your phone’s settings, then try again.'}
            </Text>
            <Text style={styles.modalNote}>
              If you need urgent help right now, call 10177.
            </Text>

            <TouchableOpacity
              style={styles.modalPrimaryBtn}
              onPress={() => {
                setLocationIssue(null);
                triggerSOS();
              }}
            >
              <Text style={styles.modalPrimaryText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryBtn}
              onPress={() => Linking.openSettings().catch(() => {})}
            >
              <Text style={styles.modalSecondaryText}>Open Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setLocationIssue(null)}>
              <Text style={styles.modalDismiss}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalBody: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  modalNote: {
    color: Colors.textSecondary,
    fontSize: FontSizes.xs,
    textAlign: 'center',
  },
  modalPrimaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#CC1111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  modalPrimaryText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '800',
  },
  modalSecondaryBtn: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: Colors.textSecondary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSecondaryText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  modalDismiss: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    paddingVertical: Spacing.sm,
  },
});