import type { ConfirmationResult } from '@react-native-firebase/auth';

export type Country = { name: string; dial: string; sample: string };

export const COUNTRIES: Country[] = [
  { name: 'Malawi', dial: '+265', sample: '99 123 4567' },
  { name: 'South Africa', dial: '+27', sample: '71 234 5678' },
  { name: 'Zambia', dial: '+260', sample: '97 123 4567' },
  { name: 'Mozambique', dial: '+258', sample: '84 123 4567' },
  { name: 'Tanzania', dial: '+255', sample: '71 234 5678' },
];

/** Turns "099 123 4567" into "+265991234567". Drops a leading 0 after the country code. */
export function toE164(dial: string, local: string) {
  const digits = local.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `${dial}${digits}` : '';
}

/**
 * The confirmation from signInWithPhoneNumber cannot travel in route params,
 * so the login screen leaves it here for the verify screen.
 */
let pending: { phone: string; confirmation: ConfirmationResult } | null = null;

export function setPendingSignIn(p: typeof pending) {
  pending = p;
}

export function getPendingSignIn() {
  return pending;
}
