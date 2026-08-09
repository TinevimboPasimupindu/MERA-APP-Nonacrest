import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

export type Coordinate = { latitude: number; longitude: number };

// How long a marker takes to glide from its previous position to a newly
// received one, rather than snapping straight to it. Shared by both the
// patient's view of the ambulance (emergency-active.tsx, polled from the
// server every 10s) and the EMT's view of their own device position
// (active-response.tsx, re-read from GPS every ~12s) — both update on a
// similar cadence and have the same "don't jump" requirement.
const MARKER_ANIMATION_MS = 1500;

// Eases the returned coordinate toward `target` instead of snapping straight
// to it whenever `target` changes. Pure JS (Animated.Value used only as a
// timing/easing driver, read via a listener into React state) rather than
// react-native-maps' own AnimatedRegion/animateMarkerToCoordinate APIs —
// this avoids depending on native marker imperative APIs, whose behavior
// under React Native's New Architecture (enabled in this project's
// app.json) is inconsistent across react-native-maps versions.
export function useSmoothCoordinate(target: Coordinate | null): Coordinate | null {
  const [display, setDisplay] = useState<Coordinate | null>(target);
  const progress = useRef(new Animated.Value(0)).current;
  const fromRef = useRef<Coordinate | null>(null);
  const toRef = useRef<Coordinate | null>(null);

  useEffect(() => {
    if (!target) {
      fromRef.current = null;
      toRef.current = null;
      setDisplay(null);
      return;
    }

    const previous = toRef.current;
    toRef.current = target;

    if (!previous) {
      // First fix we've ever had for this marker — nothing to glide from,
      // so it just appears at the right spot instead of animating in from
      // an arbitrary location.
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    if (previous.latitude === target.latitude && previous.longitude === target.longitude) {
      return; // Unchanged position this update — nothing to animate.
    }

    fromRef.current = previous;
    progress.setValue(0);
    const listenerId = progress.addListener(({ value }) => {
      const from = fromRef.current;
      const to = toRef.current;
      if (!from || !to) return;
      setDisplay({
        latitude: from.latitude + (to.latitude - from.latitude) * value,
        longitude: from.longitude + (to.longitude - from.longitude) * value,
      });
    });

    Animated.timing(progress, {
      toValue: 1,
      duration: MARKER_ANIMATION_MS,
      useNativeDriver: false, // driving JS-side lat/lng interpolation, not a native style prop
    }).start();

    return () => {
      progress.removeListener(listenerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.latitude, target?.longitude]);

  return display;
}
