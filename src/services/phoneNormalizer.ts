export interface PhoneValidationResult {
  isValid: boolean;
  normalized: string;
  countryCode: string;
  reason?: string;
}

/**
 * Normalizes phone numbers to standard E.164 format without '+' (digits only).
 * Handles Indian numbers (10 digits starting with 6, 7, 8, 9) and general international formats.
 */
export function normalizePhoneNumber(
  rawInput: string | number | undefined | null,
  defaultCountryCode = '91'
): PhoneValidationResult {
  if (rawInput === undefined || rawInput === null) {
    return { isValid: false, normalized: '', countryCode: defaultCountryCode, reason: 'Empty phone number' };
  }

  // Convert to string and remove non-digit characters except leading '+'
  let str = String(rawInput).trim();
  if (!str) {
    return { isValid: false, normalized: '', countryCode: defaultCountryCode, reason: 'Empty phone number' };
  }

  // Handle scientific notation e.g. 9.19876E+11 from Excel
  if (str.toLowerCase().includes('e+')) {
    const num = Number(str);
    if (!isNaN(num)) {
      str = BigInt(Math.floor(num)).toString();
    }
  }

  // Remove spaces, hyphens, brackets, dots
  let digits = str.replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }

  // Strip leading zero(s) (e.g. 09876543210 -> 9876543210)
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  // If 10 digits and default country is 91 (India)
  if (digits.length === 10) {
    // Validate Indian mobile starting digit (6, 7, 8, 9)
    if (defaultCountryCode === '91') {
      const firstDigit = digits.charAt(0);
      if (!['6', '7', '8', '9'].includes(firstDigit)) {
        return {
          isValid: false,
          normalized: defaultCountryCode + digits,
          countryCode: defaultCountryCode,
          reason: `Indian mobile numbers must start with 6, 7, 8, or 9 (got '${firstDigit}')`
        };
      }
    }
    digits = defaultCountryCode + digits;
  }

  // If 12 digits starting with 91 (India with country code)
  if (digits.length === 12 && digits.startsWith('91')) {
    const mobileFirstDigit = digits.charAt(2);
    if (!['6', '7', '8', '9'].includes(mobileFirstDigit)) {
      return {
        isValid: false,
        normalized: digits,
        countryCode: '91',
        reason: `Indian mobile part must start with 6, 7, 8, or 9 (got '${mobileFirstDigit}')`
      };
    }
  }

  // Global E.164 length validation: between 10 and 15 digits
  if (digits.length < 10 || digits.length > 15) {
    return {
      isValid: false,
      normalized: digits,
      countryCode: defaultCountryCode,
      reason: `Invalid digit length: ${digits.length} digits (expected 10 to 15 digits)`
    };
  }

  // All checks passed
  let countryCode = defaultCountryCode;
  if (digits.startsWith('91') && digits.length === 12) {
    countryCode = '91';
  } else if (digits.startsWith('1') && digits.length === 11) {
    countryCode = '1';
  } else if (digits.startsWith('44') && (digits.length === 12 || digits.length === 13)) {
    countryCode = '44';
  } else if (digits.startsWith('971')) {
    countryCode = '971';
  }

  return {
    isValid: true,
    normalized: digits,
    countryCode
  };
}

/**
 * Normalizes opt-in consent inputs from Excel columns.
 */
export function normalizeConsent(val: any): { isOptedIn: boolean; rawStatus: string } {
  if (val === undefined || val === null) {
    return { isOptedIn: false, rawStatus: 'NO_CONSENT_PROVIDED' };
  }
  const str = String(val).trim().toLowerCase();
  const affirmative = ['yes', 'y', 'true', '1', 'optin', 'opt-in', 'opted-in', 'opted in', 'agreed', 'consent', 'subscribed'];
  if (affirmative.includes(str)) {
    return { isOptedIn: true, rawStatus: 'OPTED_IN' };
  }
  const negative = ['no', 'n', 'false', '0', 'optout', 'opt-out', 'opted-out', 'dnd', 'stop'];
  if (negative.includes(str)) {
    return { isOptedIn: false, rawStatus: 'OPTED_OUT' };
  }
  return { isOptedIn: false, rawStatus: 'CONSENT_REQUIRED' };
}
