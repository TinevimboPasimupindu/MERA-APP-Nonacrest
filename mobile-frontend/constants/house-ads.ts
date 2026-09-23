import { ImageSourcePropType } from 'react-native';

/**
 * "House ads" — a small, hardcoded sponsor-banner config for the patient
 * dashboard, built for the team's monetization/sustainability business
 * case for the capstone. This is a simple in-house component, NOT a real
 * ad network integration: no SDK, no account, no real sponsors.
 *
 * Each ad is now a full pre-designed banner IMAGE (assets/images/ad-*.png —
 * team-supplied creatives) rather than an emoji + rendered text row: the
 * name/tagline/logo are already part of the image's own design, so
 * `label` below exists only for accessibility (screen readers), not to be
 * rendered as visible text over/under the image. The six sponsor names
 * ("VitalCare Insurance", "CityHealth Medical Center", "Nature's Plus
 * Wellness", "Apex Fitness Studio", "LifeLine Blood Drive", "QuickMeds
 * Pharmacy") are mockup creatives for the monetization pitch, not real
 * partners — nothing here represents an actual business relationship.
 *
 * `require(...)` must stay a static, literal path per call — Metro
 * resolves these at bundle time, so this list can't be generated
 * dynamically from a folder listing.
 *
 * ── Creative export size ──────────────────────────────────────────────
 * Design/export each banner at **960 × 150 px** (landscape PNG,
 * transparent or solid background either works) — an aspect ratio of
 * 6.4:1 (AD_ASPECT_RATIO below), the same ratio as the standard 320×50pt
 * mobile "banner" ad unit, just exported at 3x for a sharp result on
 * modern phone screens. house-ads-banner.tsx renders the card at a fixed
 * 58pt height and uses contentFit="contain" (never crops), so an image at
 * — or proportioned to — 960×150 fills that height almost exactly, edge
 * to edge, with at most a sliver of letterboxing depending on the exact
 * device width. AD_ASPECT_RATIO itself isn't applied as a layout property
 * on the card (an earlier version tried sizing the card BY this ratio
 * directly via React Native's `aspectRatio` style — see the "Sizing
 * history" note in house-ads-banner.tsx for why that was reverted: Yoga
 * doesn't reliably derive a height from `aspectRatio` alone without an
 * explicit width, and it made the banner render smaller and off-center);
 * it's kept here purely as the documented design target for new/
 * replacement creatives. The six creatives below are all exactly 960×150
 * (verified via each PNG's own header, not assumed).
 */
export const AD_ASPECT_RATIO = 6.4; // 320:50 — the target ratio for new creatives (960×150); see note above

export type HouseAd = {
  id: string;
  image: ImageSourcePropType;
  label: string; // accessibilityLabel only — not rendered as visible text
  // Approximate dominant edge color of the banner image, used as the
  // card's own background so any letterbox/crop edge blends in rather
  // than showing a mismatched hard edge.
  bgColor: string;
};

export const HOUSE_ADS: HouseAd[] = [
  {
    id: 'vitalcare-insurance',
    image: require('../assets/images/ad-vitalcare-insurance.png'),
    label: 'Advertisement: VitalCare Insurance',
    bgColor: '#dceaf5',
  },
  {
    id: 'cityhealth-medical-center',
    image: require('../assets/images/ad-cityhealth-medical-center.png'),
    label: 'Advertisement: CityHealth Medical Center, Private Clinic',
    bgColor: '#ffffff',
  },
  {
    id: 'natures-plus-wellness',
    image: require('../assets/images/ad-natures-plus-wellness.png'),
    label: "Advertisement: Nature's Plus Wellness — Nourish Your Body, Elevate Your Life",
    bgColor: '#eef1df',
  },
  {
    id: 'apex-fitness-studio',
    image: require('../assets/images/ad-apex-fitness-studio.png'),
    label: 'Advertisement: Apex Fitness Studio',
    bgColor: '#24242e',
  },
  {
    id: 'lifeline-blood-drive',
    image: require('../assets/images/ad-lifeline-blood-drive.png'),
    label: 'Advertisement: LifeLine Blood Drive — Donate Blood, Save Lives',
    bgColor: '#7a1518',
  },
  {
    id: 'quickmeds-pharmacy',
    image: require('../assets/images/ad-quickmeds-pharmacy.png'),
    label: 'Advertisement: QuickMeds Pharmacy — 24/7 Prescription Delivery',
    bgColor: '#4a2a7a',
  },
];

// How often the banner cycles to the next ad. "A few seconds," per spec —
// slow enough to be readable, fast enough to visibly rotate on a screen
// someone might only glance at.
export const HOUSE_AD_ROTATE_MS = 5000;
