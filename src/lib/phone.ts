/** A phone number as people type it: digits with optional +, spaces, dashes, dots and brackets; 7–15 digits. */
export function isValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return phone.length <= 32 && /^\+?[\d\s().-]+$/.test(phone) && digits.length >= 7 && digits.length <= 15;
}
