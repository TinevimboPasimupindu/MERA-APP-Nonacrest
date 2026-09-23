import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Spacing, BorderRadius } from '../constants/theme';
import { HOUSE_ADS, HOUSE_AD_ROTATE_MS } from '../constants/house-ads';
import { newDebugId, debugMount, debugUnmount } from '../utils/debug-instances'; // [DBG]

// Small "house ads" banner for the patient dashboard — part of the team's
// monetization/sustainability business case for the capstone (see
// constants/house-ads.ts for the placeholder creatives, the target export
// size for new ones, and full context).
//
// Each ad is a full pre-designed banner image rather than an emoji +
// rendered text row — the sponsor name/tagline/logo are already part of
// the image itself, so there's no separate text to render here.
//
// Auto-rotates on a plain setInterval + cleanup, the same idiom already
// used throughout this codebase for anything time-based (patient-
// dashboard.tsx's own active-incident poll, emergency-active.tsx's
// incident poll, active-response.tsx's location-send loop) — there's no
// existing carousel component or pattern anywhere in this app to reuse,
// so this follows that same general shape rather than introducing a new
// one. A short opacity crossfade (Animated.timing, mirroring the
// scale/pulse animations patient-dashboard.tsx already builds the SOS
// button with) softens the swap instead of an abrupt content jump; the
// card's own background briefly shows through mid-fade (each ad's
// approximate own tone — see HouseAd.bgColor), so the transition reads as
// a soft cross-tint rather than a flash of empty space.
//
// ── Sizing history — three attempts, this is the one that actually works ──
// v1: fixed pixel height + contentFit="cover" → cropped real content off
//     the right edge of every creative.
// v2: switched the CONTAINER itself to `aspectRatio` (no explicit width)
//     + contentFit="contain" to stop the cropping. This introduced a
//     different, worse bug: React Native's Yoga layout only reliably
//     derives a height from `aspectRatio` when the node also has an
//     unambiguous, explicit width — relying on plain flex-stretch to
//     imply that width is inconsistently supported, and here it caused
//     the whole banner to render smaller than intended AND right-shifted
//     instead of centered.
// v3 (current): back to a fixed pixel height (BANNER_HEIGHT, same value
//     as v1 — same size that already looked right), but keeping
//     contentFit="contain" (not "cover") so nothing crops. This avoids
//     `aspectRatio` on the container entirely — a fixed-height block with
//     only horizontal margins is the exact same plain, reliable stretch-
//     to-fill sizing every other section of this screen already uses
//     (header/bottomNav below), so there's no layout ambiguity left to
//     trigger the v2 bug. Since the current creatives are exported at
//     exactly the 960×150 (6.4:1) target documented in house-ads.ts,
//     `contain` renders them at very close to this exact height already
//     (58 vs. a natural ~56-62 depending on device width) — any gap is a
//     sliver, and `contain` always centers within its box by default, so
//     on a wider phone the ad reads as a slightly narrower, properly
//     centered image rather than a cropped or misaligned one.
//
// Deliberately dashboard-only: this component is only ever imported by
// app/(patient)/patient-dashboard.tsx. It must never appear on the SOS
// button, emergency-active.tsx, active-response.tsx, or any other
// active-incident tracking screen — kept visually small and clearly
// secondary so it never competes with the actual emergency functionality.
const BANNER_HEIGHT = 58;

export default function HouseAdsBanner() {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // [DBG] temporary — see utils/debug-instances.ts
  const dbgId = useRef(newDebugId()).current;
  useEffect(() => {
    debugMount('AdsBanner', dbgId);
    return () => debugUnmount('AdsBanner', dbgId);
  }, [dbgId]);

  useEffect(() => {
    if (HOUSE_ADS.length <= 1) return;

    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setIndex((prev) => (prev + 1) % HOUSE_ADS.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }, HOUSE_AD_ROTATE_MS);

    return () => clearInterval(interval);
  }, [fadeAnim]);

  if (HOUSE_ADS.length === 0) return null;

  const ad = HOUSE_ADS[index];

  return (
    <View style={[styles.wrap, { backgroundColor: ad.bgColor }]}>
      <Animated.View style={[styles.fill, { opacity: fadeAnim }]}>
        <Image
          source={ad.image}
          accessibilityLabel={ad.label}
          contentFit="contain"
          style={styles.fill}
          transition={0} // the wrapping Animated.View already handles the crossfade
        />
      </Animated.View>

      <View style={styles.adTag}>
        <Text style={styles.adTagText}>AD</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: BANNER_HEIGHT,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  adTag: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adTagText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
