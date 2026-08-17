import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IResponse } from "../../../../package/types/http/IResponse.js";
import { ResponseHelper } from "../../../../package/core/http/response/helper/ResponseHelper.js";
import { HTTP_STATUS_REGISTRY } from "../../../../package/core/http/response/services/helpers.service.js";

describe("ResponseHelper", () => {
  let mockResponse: IResponse;

  beforeEach(() => {
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as IResponse;
  });

  it("should instantiate helper with reference to IResponse", () => {
    const helper = new ResponseHelper(mockResponse);
    expect(helper.res).toBe(mockResponse);
  });

  it("should have generated helper methods for all registry entries", () => {
    const helper = new ResponseHelper(mockResponse) as any;

    for (const entry of HTTP_STATUS_REGISTRY.values()) {
      expect(typeof helper[entry.message]).toBe("function");
    }
  });

  describe("Success Helpers", () => {
    it("should handle ok/success helper with data payload", () => {
      const helper = new ResponseHelper(mockResponse) as any;
      helper.success({ token: "abc" });

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { token: "abc" },
      });
    });

    it("should handle created (201) helper with undefined payload", () => {
      const helper = new ResponseHelper(mockResponse) as any;
      helper.created();

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: undefined,
      });
    });
  });

  describe("Error Helpers", () => {
    it("should handle error helper with default title-cased fallback message", () => {
      const helper = new ResponseHelper(mockResponse) as any;
      helper.not_found();

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: "Not Found",
      });
    });

    it("should handle error helper with custom string message and details", () => {
      const helper = new ResponseHelper(mockResponse) as any;
      helper.bad_request("Validation failed", { field: "email" });

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: "Validation failed",
        details: { field: "email" },
      });
    });

    it("should extract message from Error instance", () => {
      const helper = new ResponseHelper(mockResponse) as any;
      const err = new Error("Database query timed out");
      helper.internal_server_error(err);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: "Database query timed out",
      });
    });
  });
});
