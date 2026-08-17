// tests/package/subatom/helpers/createRateLimitMiddleware.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimitMiddleware } from '../../../../package/core/bootstrap/subatom/helpers/createRateLimitMiddleware';

describe('createRateLimitMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createMockReq = (overrides: Record<string, any> = {}) => ({
    ip: undefined,
    rawRequest: {
      socket: {},
      headers: {},
    },
    ...overrides,
  });

  const createMockRes = (overrides: Record<string, any> = {}) => {
    const headers = new Map<string, string>();
    const res = {
      rawResponse: {
        headersSent: false,
        writableEnded: false,
        setHeader: vi.fn((key: string, val: string) => {
          headers.set(key.toLowerCase(), val);
        }),
        getHeader: vi.fn((key: string) => headers.get(key.toLowerCase())),
        writeHead: vi.fn(),
        end: vi.fn(),
        ...overrides,
      },
    };
    return { res, headers };
  };

  describe('Standard Rate Limiting & Header Tracking', () => {
    it('allows requests within limit and sets correct rate limit headers', () => {
      // 5 requests per 1 minute (60,000ms)
      const middleware = createRateLimitMiddleware('5/min');
      const req = createMockReq({ ip: '192.168.1.1' });
      const next = vi.fn();

      const { res } = createMockRes();
      middleware(req as any, res as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.rawResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(res.rawResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
      expect(res.rawResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(String),
      );
    });

    it('decrements remaining counter on successive calls', () => {
      const middleware = createRateLimitMiddleware('3/min');
      const req = createMockReq({ ip: '10.0.0.1' });

      for (let i = 1; i <= 3; i++) {
        const next = vi.fn();
        const { res } = createMockRes();
        middleware(req as any, res as any, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.rawResponse.setHeader).toHaveBeenCalledWith(
          'X-RateLimit-Remaining',
          String(3 - i),
        );
      }
    });
  });

  describe('Exceeding Limits & 429 Response', () => {
    it('blocks requests exceeding limit with 429 and Retry-After header', () => {
      const middleware = createRateLimitMiddleware('2/sec');
      const req = createMockReq({ ip: '127.0.0.1' });

      // Request 1: OK
      middleware(req as any, createMockRes().res as any, vi.fn());
      // Request 2: OK
      middleware(req as any, createMockRes().res as any, vi.fn());

      // Request 3: Rate limited
      const nextBlocked = vi.fn();
      const { res: blockedRes } = createMockRes();

      middleware(req as any, blockedRes as any, nextBlocked);

      expect(nextBlocked).not.toHaveBeenCalled();
      expect(blockedRes.rawResponse.writeHead).toHaveBeenCalledWith(429, {
        'Content-Type': 'application/json',
      });
      expect(blockedRes.rawResponse.setHeader).toHaveBeenCalledWith('Retry-After', '1');
      expect(blockedRes.rawResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');

      const responseBody = JSON.parse(blockedRes.rawResponse.end.mock.calls[0][0]);
      expect(responseBody).toEqual({
        error: 'Too Many Requests',
        message: 'Rate limit of 2 requests per 1000ms exceeded.',
        retryAfter: 1,
      });
    });

    it('does not attempt to write 429 if response is already closed/writableEnded', () => {
      const middleware = createRateLimitMiddleware('1/sec');
      const req = createMockReq({ ip: '127.0.0.1' });

      middleware(req as any, createMockRes().res as any, vi.fn());

      const next = vi.fn();
      const { res } = createMockRes({ writableEnded: true });

      middleware(req as any, res as any, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.rawResponse.writeHead).not.toHaveBeenCalled();
      expect(res.rawResponse.end).not.toHaveBeenCalled();
    });
  });

  describe('Window Expiration & Bucket Reset', () => {
    it('resets limit once windowMs duration passes', () => {
      const middleware = createRateLimitMiddleware('1/sec');
      const req = createMockReq({ ip: '192.168.0.50' });

      // Consume limit
      const next1 = vi.fn();
      middleware(req as any, createMockRes().res as any, next1);
      expect(next1).toHaveBeenCalledTimes(1);

      // Advance 500ms -> Still within 1000ms window (Blocked)
      vi.advanceTimersByTime(500);
      const nextBlocked = vi.fn();
      middleware(req as any, createMockRes().res as any, nextBlocked);
      expect(nextBlocked).not.toHaveBeenCalled();

      // Advance past the 1000ms window
      vi.advanceTimersByTime(501);

      // Allowed again
      const nextAllowed = vi.fn();
      const { res } = createMockRes();
      middleware(req as any, res as any, nextAllowed);

      expect(nextAllowed).toHaveBeenCalledTimes(1);
      expect(res.rawResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    });
  });

  describe('Client Identification Strategy', () => {
    it('falls back to socket.remoteAddress if req.ip is absent', () => {
      const middleware = createRateLimitMiddleware('1/min');
      const req = {
        rawRequest: {
          socket: { remoteAddress: '172.16.0.1' },
          headers: {},
        },
      };

      const next1 = vi.fn();
      middleware(req as any, createMockRes().res as any, next1);
      expect(next1).toHaveBeenCalledTimes(1);

      const next2 = vi.fn();
      middleware(req as any, createMockRes().res as any, next2);
      expect(next2).not.toHaveBeenCalled();
    });

    it('falls back to x-forwarded-for if both ip and socket address are absent', () => {
      const middleware = createRateLimitMiddleware('1/min');
      const req = {
        rawRequest: {
          headers: { 'x-forwarded-for': '203.0.113.195' },
        },
      };

      const next = vi.fn();
      middleware(req as any, createMockRes().res as any, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('uses "unknown" bucket key when no IP metadata exists', () => {
      const middleware = createRateLimitMiddleware('1/min');
      const emptyReq = {};

      const next1 = vi.fn();
      middleware(emptyReq as any, createMockRes().res as any, next1);
      expect(next1).toHaveBeenCalledTimes(1);

      const next2 = vi.fn();
      middleware(emptyReq as any, createMockRes().res as any, next2);
      expect(next2).not.toHaveBeenCalled();
    });

    it('tracks distinct IP addresses independently', () => {
      const middleware = createRateLimitMiddleware('1/min');

      const reqA = createMockReq({ ip: '1.1.1.1' });
      const reqB = createMockReq({ ip: '2.2.2.2' });

      const nextA1 = vi.fn();
      const nextB1 = vi.fn();
      middleware(reqA as any, createMockRes().res as any, nextA1);
      middleware(reqB as any, createMockRes().res as any, nextB1);

      expect(nextA1).toHaveBeenCalledTimes(1);
      expect(nextB1).toHaveBeenCalledTimes(1);

      const nextA2 = vi.fn();
      middleware(reqA as any, createMockRes().res as any, nextA2);
      expect(nextA2).not.toHaveBeenCalled();
    });
  });

  describe('Garbage Collection & Sweep Timer', () => {
    it('cleans up expired buckets periodically', () => {
      const middleware = createRateLimitMiddleware('2/sec');
      const req = createMockReq({ ip: '10.0.0.99' });

      middleware(req as any, createMockRes().res as any, vi.fn());

      // Advance time beyond the 1000ms window + sweep interval
      vi.advanceTimersByTime(1100);

      // New request after sweep starts fresh
      const next = vi.fn();
      const { res } = createMockRes();
      middleware(req as any, res as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.rawResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '1');
    });
  });

  describe('Fail-Open Error Resilience', () => {
    it('fails open and calls next() if an unexpected runtime error occurs', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const middleware = createRateLimitMiddleware('5/min');

      const corruptedReq = {
        get ip() {
          throw new Error('Unexpected memory read failure');
        },
      };

      const next = vi.fn();
      middleware(corruptedReq as any, createMockRes().res as any, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Subatom Warning]: Rate limiter middleware failed'),
        expect.any(Error),
      );
    });
  });
});