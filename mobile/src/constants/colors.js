// Mirrors tailwind.config.js from neomatcare-frontend exactly
export const Colors = {
  // Brand (matches tailwind brand-* scale)
  primary:      '#2f9466',  // brand-500
  primaryLight: '#dcf1e6',  // brand-100
  primaryDark:  '#207652',  // brand-600

  secondary:      '#0284c7', // sky-600
  secondaryLight: '#e0f2fe',
  secondaryDark:  '#0369a1',

  // Status
  success:      '#16a34a',
  successLight: '#dcfce7',
  successDark:  '#15803d',

  warning:      '#f59e0b',
  warningLight: '#fef3c7',
  warningDark:  '#d97706',

  danger:      '#e43418',   // danger-600 (matches tailwind danger scale)
  dangerLight: '#ffe8e4',   // danger-100
  dangerDark:  '#c02812',   // danger-700

  info:      '#0284c7',
  infoLight: '#e0f2fe',
  infoDark:  '#0369a1',

  // Neutrals
  white: '#ffffff',
  black: '#000000',

  gray50:  '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  // Backgrounds
  background:        '#f9fafb',
  surface:           '#ffffff',
  surfaceSecondary:  '#f3f4f6',

  // Text
  textPrimary:   '#111827',
  textSecondary: '#6b7280',
  textMuted:     '#9ca3af',
  textInverse:   '#ffffff',

  // Borders
  border:      '#e5e7eb',
  borderFocus: '#2f9466',  // brand-500

  // Role badge colors (matching frontend Badge component)
  roles: {
    health_worker:  { bg: '#dcf1e6', text: '#1a5e42' },  // brand-100 / brand-700
    specialist:     { bg: '#ede9fe', text: '#6d28d9' },
    facility_admin: { bg: '#fef3c7', text: '#92400e' },
    driver:         { bg: '#fce7f3', text: '#9d174d' },
    superadmin:     { bg: '#fee2e2', text: '#991b1b' },
  },

  // Status badge colors (matching frontend Badge component)
  status: {
    pending:    { bg: '#fef3c7', text: '#92400e' },
    active:     { bg: '#dcfce7', text: '#15803d' },
    completed:  { bg: '#e0f2fe', text: '#0369a1' },
    cancelled:  { bg: '#fee2e2', text: '#991b1b' },
    accepted:   { bg: '#dcfce7', text: '#15803d' },
    rejected:   { bg: '#fee2e2', text: '#991b1b' },
    in_transit: { bg: '#ede9fe', text: '#6d28d9' },
    delivered:  { bg: '#dcfce7', text: '#15803d' },
  },
};

export default Colors;
