import { describe, expect, it } from 'vitest';
import { assertFriday, isFriday, nextFriday, parseLocalDate, NotAFridayError } from '../src/lib/scheduling';

describe('Friday validation', () => {
  it('accepts a real Friday', () => {
    expect(isFriday('2026-07-17')).toBe(true); // Friday
  });

  it('rejects a non-Friday', () => {
    expect(isFriday('2026-07-18')).toBe(false); // Saturday
  });

  it('assertFriday throws NotAFridayError with a helpful message for non-Fridays', () => {
    expect(() => assertFriday('2026-07-18')).toThrow(NotAFridayError);
    try {
      assertFriday('2026-07-18');
    } catch (err) {
      expect((err as Error).message).toContain('Saturday');
      expect((err as Error).message).toContain('Friday');
    }
  });

  it('assertFriday passes through a valid Friday unchanged', () => {
    expect(assertFriday('2026-08-07')).toBe('2026-08-07');
  });

  it('nextFriday rolls forward to the nearest Friday on/after the given date', () => {
    expect(nextFriday('2026-07-18')).toBe('2026-07-24'); // Sat -> next Fri
    expect(nextFriday('2026-07-17')).toBe('2026-07-17'); // already Friday
  });
});

describe('Australia/Melbourne timezone handling', () => {
  it('resolves AEST (UTC+10) for a winter date without hardcoding the offset', () => {
    const dt = parseLocalDate('2026-07-17'); // July = AEST in Melbourne
    expect(dt.offset).toBe(600); // +10:00 in minutes
  });

  it('resolves AEDT (UTC+11) for a summer date without hardcoding the offset', () => {
    const dt = parseLocalDate('2026-01-09'); // January = AEDT in Melbourne
    expect(dt.offset).toBe(660); // +11:00 in minutes
  });

  it('still reports the correct weekday across the DST boundary', () => {
    // 2026-10-04 is the Sunday AEDT starts in Australia; the Friday before
    // (2026-10-02) must still validate correctly across the transition.
    expect(isFriday('2026-10-02')).toBe(true);
  });

  it('throws a clear error for unparseable dates rather than silently coercing', () => {
    expect(() => parseLocalDate('not-a-date')).toThrow();
  });
});
