import { describe, it, expect } from "vitest";
import isContextOrHttpInstance from "../../../../../packages/core/router/helpers/httpInstanceDecider.js";
import type { IRequest } from "../../../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../../../packages/core/http/response/types/response.types.js";

describe("isContextOrHttpInstance", () => {
  const mockReq = { raw: {} } as unknown as IRequest;
  const mockRes = { raw: {} } as unknown as IResponse;
  const mockCtx = { req: mockReq, res: mockRes };

  it("should identify ctx, req, and res", () => {
    expect(isContextOrHttpInstance(mockCtx, mockCtx, mockReq, mockRes)).toBe(true);
    expect(isContextOrHttpInstance(mockReq, mockCtx, mockReq, mockRes)).toBe(true);
    expect(isContextOrHttpInstance(mockRes, mockCtx, mockReq, mockRes)).toBe(true);
  });

  it("should identify nested raw streams or ctx properties", () => {
    expect(isContextOrHttpInstance(mockCtx.req, mockCtx, mockReq, mockRes)).toBe(true);
    expect(isContextOrHttpInstance(mockCtx.res, mockCtx, mockReq, mockRes)).toBe(true);
    expect(isContextOrHttpInstance(mockReq.raw, mockCtx, mockReq, mockRes)).toBe(true);
    expect(isContextOrHttpInstance(mockRes.raw, mockCtx, mockReq, mockRes)).toBe(true);
  });

  it("should return false for arbitrary objects and primitives", () => {
    expect(isContextOrHttpInstance({ hello: "world" }, mockCtx, mockReq, mockRes)).toBe(false);
    expect(isContextOrHttpInstance("string", mockCtx, mockReq, mockRes)).toBe(false);
    expect(isContextOrHttpInstance(123, mockCtx, mockReq, mockRes)).toBe(false);
    expect(isContextOrHttpInstance(null, mockCtx, mockReq, mockRes)).toBe(false);
  });
});