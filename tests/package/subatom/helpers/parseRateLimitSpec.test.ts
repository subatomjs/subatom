// subatom/package/core/bootstrap/subatom/helpers/__tests__/parseRateLimitSpec.spec.ts

import { describe, it, expect } from 'vitest';
import { parseRateLimitSpec } from '../../../../package/core/bootstrap/subatom/helpers/parseRateLimitSpec.js';

describe('parseRateLimitSpec', () => {
  describe('Valid Unit Variations & Calculations', () => {
    describe('Milliseconds (ms)', () => {
      const units = ['ms', 'millisecond', 'milliseconds', 'MS', 'MilliSecond'];
      it.each(units)('correctly parses millisecond alias "%s"', (unit) => {
        expect(parseRateLimitSpec(`500/${unit}`)).toEqual({
          limit: 500,
          windowMs: 1,
        });
      });
    });

    describe('Seconds (s)', () => {
      const units = ['s', 'sec', 'secs', 'second', 'seconds', 'SEC', 'Seconds'];
      it.each(units)('correctly parses second alias "%s"', (unit) => {
        expect(parseRateLimitSpec(`10/${unit}`)).toEqual({
          limit: 10,
          windowMs: 1_000,
        });
      });
    });

    describe('Minutes (m)', () => {
      const units = ['m', 'min', 'mins', 'minute', 'minutes', 'MIN', 'Minutes'];
      it.each(units)('correctly parses minute alias "%s"', (unit) => {
        expect(parseRateLimitSpec(`100/${unit}`)).toEqual({
          limit: 100,
          windowMs: 60_000,
        });
      });
    });

    describe('Hours (h)', () => {
      const units = ['h', 'hr', 'hrs', 'hour', 'hours', 'HR', 'Hours'];
      it.each(units)('correctly parses hour alias "%s"', (unit) => {
        expect(parseRateLimitSpec(`1000/${unit}`)).toEqual({
          limit: 1000,
          windowMs: 3_600_000,
        });
      });
    });

    describe('Days (d)', () => {
      const units = ['d', 'day', 'days', 'DAY', 'Days'];
      it.each(units)('correctly parses day alias "%s"', (unit) => {
        expect(parseRateLimitSpec(`50000/${unit}`)).toEqual({
          limit: 50000,
          windowMs: 86_400_000,
        });
      });
    });
  });

  describe('Whitespace & Formatting Resilience', () => {
    it('handles outer leading and trailing whitespace', () => {
      expect(parseRateLimitSpec('   100/min   ')).toEqual({
        limit: 100,
        windowMs: 60_000,
      });
    });

    it('handles spaces around the delimiter slash', () => {
      expect(parseRateLimitSpec('50 / sec')).toEqual({
        limit: 50,
        windowMs: 1_000,
      });
      expect(parseRateLimitSpec('50    /    sec')).toEqual({
        limit: 50,
        windowMs: 1_000,
      });
    });
  });

  describe('Validation & Error Scenarios', () => {
    it('throws TypeError when input is not a non-empty string', () => {
      // @ts-expect-error - testing invalid runtime types
      expect(() => parseRateLimitSpec(null)).toThrow(TypeError);
      // @ts-expect-error - testing invalid runtime types
      expect(() => parseRateLimitSpec(undefined)).toThrow(TypeError);
      // @ts-expect-error - testing invalid runtime types
      expect(() => parseRateLimitSpec(123)).toThrow(TypeError);
      expect(() => parseRateLimitSpec('')).toThrow(
        '[Subatom] rateLimit() requires a non-empty string like "100/min".',
      );
      expect(() => parseRateLimitSpec('   ')).toThrow(
        '[Subatom] rateLimit() requires a non-empty string like "100/min".',
      );
    });

    it('throws TypeError on malformed structural patterns', () => {
      const malformedInputs = [
        '100',
        '/min',
        '100/',
        '100-min',
        '100/min/sec',
        'hundred/min',
        '100 / 20min',
        '100/min123',
      ];

      for (const input of malformedInputs) {
        expect(() => parseRateLimitSpec(input)).toThrow(
          `[Subatom] Invalid rate limit specification "${input}". Expected a format like "100/min".`,
        );
      }
    });

    it('throws TypeError when limit is zero or non-positive', () => {
      expect(() => parseRateLimitSpec('0/min')).toThrow(
        '[Subatom] Invalid rate limit count in "0/min". Must be a positive integer.',
      );
      expect(() => parseRateLimitSpec('000/sec')).toThrow(
        '[Subatom] Invalid rate limit count in "000/sec". Must be a positive integer.',
      );
    });

    it('throws TypeError on unsupported time units', () => {
      const unsupportedInputs = [
        { spec: '100/week', unit: 'week' },
        { spec: '100/month', unit: 'month' },
        { spec: '100/yr', unit: 'yr' },
        { spec: '100/invalid', unit: 'invalid' },
      ];

      for (const { spec, unit } of unsupportedInputs) {
        expect(() => parseRateLimitSpec(spec)).toThrow(
          `[Subatom] Invalid rate limit unit "${unit}" in "${spec}". Supported units: ms, s, m, h, d.`,
        );
      }
    });
  });
});