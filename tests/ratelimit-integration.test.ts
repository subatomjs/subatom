// test/rate-limit/integration.test.ts
import { describe, it, expect, vi } from "vitest";
import { rateLimit } from "../subatom/core/securities/rate-limits/index";

describe("Subatom Rate Limit Integration Tests", () => {
  it("allows requests under the limit and sets headers", async () => {
    const middleware = rateLimit({ limit: 2, window: "1s", store: "memory" });
    const req: any = { ip: "127.0.0.1" };
    const res: any = { 
      setHeader: vi.fn(), 
      status: vi.fn().mockReturnThis(), 
      json: vi.fn() 
    };
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Remaining", 1);
  });

  it("blocks requests over limit with 429 status", async () => {
    const middleware = rateLimit({ limit: 1, window: "1s", store: "memory" });
    const req: any = { ip: "10.0.0.1" };
    const res: any = { 
      setHeader: vi.fn(), 
      status: vi.fn().mockReturnThis(), 
      json: vi.fn() 
    };
    const next = vi.fn();

    await middleware(req, res, next); // Request 1: allowed
    await middleware(req, res, next); // Request 2: rejected (429)

    expect(res.status).toHaveBeenCalledWith(429);
  });
});