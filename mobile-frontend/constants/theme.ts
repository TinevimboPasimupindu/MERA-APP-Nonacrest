/**
 * MERA Design System — Theme Constants
 * 
 * This file is the single source of truth for all styling in the app.
 * Import Colors, FontSizes, Spacing, and BorderRadius into any screen or component.
 * 
 * Usage:
 * import { Colors, FontSizes, Spacing, BorderRadius } from '../../constants/theme';
 */

export const Colors = {
  // Core backgrounds
  background: '#0F0F1A',
  surface: '#404259',
  
  // Brand colours
  primary: '#3D85FF',
  emergency: '#991717',
  success: '#2ECC70',
  warning: '#FFB21A',
  ambulance: '#F2731A',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0B0',
  textDark: '#0F0F1A',

  // Status badges
  verified: '#2ECC70',
  pending: '#FFB21A',
  danger: '#991717',

  // Common
  white: '#FFFFFF',
  transparent: 'transparent',
};

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  heading: 28,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};