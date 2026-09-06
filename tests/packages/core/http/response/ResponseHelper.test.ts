import { describe, it, expect, vi } from "vitest";
import { ResponseHelper } from "../../../../../packages/core/http/response/helpers/ResponseHelper.js";
import type { IResponse } from "../../../../../packages/core/http/response/types/response.types.js";

describe("ResponseHelper", () => {
  it("should emit structured responses for success status helpers", () => {
    let statusCode = 200;
    let jsonPayload: unknown;

    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: unknown) {
        jsonPayload = data;
        return this;
      },
    } as unknown as IResponse;

    const helper = new ResponseHelper(mockRes);

    helper.created({ id: 101 });
    expect(statusCode).toBe(201);
    expect(jsonPayload).toEqual({ success: true, data: { id: 101 } });

    helper.no_content();
    expect(statusCode).toBe(204);
    expect(jsonPayload).toEqual({ success: true, data: undefined });
  });

  it("should emit structured responses for error status helpers", () => {
    let statusCode = 200;
    let jsonPayload: unknown;

    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: unknown) {
        jsonPayload = data;
        return this;
      },
    } as unknown as IResponse;

    const helper = new ResponseHelper(mockRes);

    helper.not_found("Resource Missing", { id: 404 });
    expect(statusCode).toBe(404);
    expect(jsonPayload).toEqual({
      success: false,
      message: "Resource Missing",
      details: { id: 404 },
    });

    helper.bad_request(new Error("Validation Failed"));
    expect(statusCode).toBe(400);
    expect(jsonPayload).toEqual({
      success: false,
      message: "Validation Failed",
    });

    helper.internal_server_error();
    expect(statusCode).toBe(500);
    expect(jsonPayload).toEqual({
      success: false,
      message: "Internal Server Error",
    });
  });
});