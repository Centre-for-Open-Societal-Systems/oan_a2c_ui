import { describe, expect, it } from 'vitest';
import {
  PHONE_NUMBER_MAX_DIGITS,
  PHONE_NUMBER_MIN_DIGITS,
  PHONE_NUMBER_REGEX,
  isValidLocalPhone,
  maxLocalPhoneDigits,
  splitPhoneNumber,
  stripDialCode,
  stripLeadingZero,
  toDigitsOnly,
  toLocalPhoneDigits,
} from './phone';

describe('phone validation utilities', () => {
  describe('bounds and regex', () => {
    it('defines min 7 and max 12 digits for local numbers', () => {
      expect(PHONE_NUMBER_MIN_DIGITS).toBe(7);
      expect(PHONE_NUMBER_MAX_DIGITS).toBe(12);
    });

    it('accepts standard 9-digit Ethiopian local subscriber numbers (starting with 9 or 7)', () => {
      expect(PHONE_NUMBER_REGEX.test('911223344')).toBe(true);
      expect(PHONE_NUMBER_REGEX.test('712345678')).toBe(true);
      expect(PHONE_NUMBER_REGEX.test('733333333')).toBe(true);
    });

    it('rejects numbers starting with trunk 0', () => {
      expect(PHONE_NUMBER_REGEX.test('0911223344')).toBe(false);
      expect(PHONE_NUMBER_REGEX.test('0712345678')).toBe(false);
    });

    it('rejects numbers with non-digits or invalid lengths', () => {
      expect(PHONE_NUMBER_REGEX.test('12345')).toBe(false); // too short
      expect(PHONE_NUMBER_REGEX.test('73333333333333')).toBe(false); // 14 digits (exceeds 12 max)
    });
  });

  describe('sanitization and formatting', () => {
    it('toDigitsOnly removes non-numeric characters', () => {
      expect(toDigitsOnly('+251 (911) 22-33-44')).toBe('251911223344');
    });

    it('stripLeadingZero drops single domestic trunk zero', () => {
      expect(stripLeadingZero('0911223344')).toBe('911223344');
      expect(stripLeadingZero('0712345678')).toBe('712345678');
      expect(stripLeadingZero('911223344')).toBe('911223344');
    });

    it('stripDialCode drops leading 251 only when followed by 9 local digits (total 12 digits)', () => {
      expect(stripDialCode('251911223344')).toBe('911223344');
      expect(stripDialCode('251712345678')).toBe('712345678');
      expect(stripDialCode('251000')).toBe('251000'); // not 12 digits, kept whole
    });

    it('toLocalPhoneDigits extracts local digits and caps at country local length', () => {
      expect(toLocalPhoneDigits('+251 911 22 33 44')).toBe('911223344');
      expect(toLocalPhoneDigits('0712345678')).toBe('712345678');
      expect(toLocalPhoneDigits('733333333333333333')).toHaveLength(9);
      expect(toLocalPhoneDigits('733333333333333333', '+1')).toHaveLength(10);
      expect(toLocalPhoneDigits('733333333333333333', '+999')).toHaveLength(PHONE_NUMBER_MAX_DIGITS);
    });
  });

  describe('country-specific local phone digits and validation', () => {
    it('returns exact local digits for known country dial codes', () => {
      expect(maxLocalPhoneDigits('+251')).toBe(9);
      expect(maxLocalPhoneDigits('+255')).toBe(9);
      expect(maxLocalPhoneDigits('+1')).toBe(10);
      expect(maxLocalPhoneDigits('+999')).toBe(PHONE_NUMBER_MAX_DIGITS);
      expect(maxLocalPhoneDigits()).toBe(PHONE_NUMBER_MAX_DIGITS);
    });

    it('validates exact length per country code with isValidLocalPhone', () => {
      // Ethiopia (+251): 9 digits
      expect(isValidLocalPhone('911223344', '+251')).toBe(true);
      expect(isValidLocalPhone('712345678', '+251')).toBe(true);
      expect(isValidLocalPhone('71234567', '+251')).toBe(false); // 8 digits
      expect(isValidLocalPhone('7123456789', '+251')).toBe(false); // 10 digits
      expect(isValidLocalPhone('0911223344', '+251')).toBe(false); // leading 0

      // US (+1): 10 digits
      expect(isValidLocalPhone('2025550199', '+1')).toBe(true);
      expect(isValidLocalPhone('202555019', '+1')).toBe(false); // 9 digits

      // Unknown country: falls back to 7-12 range
      expect(isValidLocalPhone('1234567', '+999')).toBe(true);
      expect(isValidLocalPhone('12345', '+999')).toBe(false);
    });
  });

  describe('splitPhoneNumber', () => {
    it('defaults to +251 country code for empty strings', () => {
      expect(splitPhoneNumber('')).toEqual({ countryCode: '+251', localDigits: '' });
      expect(splitPhoneNumber('   ')).toEqual({ countryCode: '+251', localDigits: '' });
    });

    it('correctly splits numbers with recognized dial codes', () => {
      expect(splitPhoneNumber('+251911223344')).toEqual({ countryCode: '+251', localDigits: '911223344' });
      expect(splitPhoneNumber('+251712345678')).toEqual({ countryCode: '+251', localDigits: '712345678' });
      expect(splitPhoneNumber('+255712345678')).toEqual({ countryCode: '+255', localDigits: '712345678' });
      expect(splitPhoneNumber('+12025550199')).toEqual({ countryCode: '+1', localDigits: '2025550199' });
    });

    it('handles legacy bare domestic numbers by defaulting to +251 and stripping trunk zero', () => {
      expect(splitPhoneNumber('0911223344')).toEqual({ countryCode: '+251', localDigits: '911223344' });
      expect(splitPhoneNumber('0712345678')).toEqual({ countryCode: '+251', localDigits: '712345678' });
    });
  });
});
