import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { setStatusCode } from "../../../../package/core/http/response/services/statusCode.service.js";

describe("statusCode.service", () => {
  function createMockServerResponse(): ServerResponse {
    return {
      statusCode: 200,
    } as unknown as ServerResponse;
  }

  it("should update status code when headers are not sent", () => {
    const raw = createMockServerResponse();
    const result = setStatusCode(raw, false, 404, 200);

    expect(result).toBe(404);
    expect(raw.statusCode).toBe(404);
  });

  it("should not update status code and warn when headers are already sent", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = createMockServerResponse();
    raw.statusCode = 200;

    const result = setStatusCode(raw, true, 500, 200);

    expect(result).toBe(200);
    expect(raw.statusCode).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Subatom Warning]: Cannot set status code after headers are sent.",
    );
    warnSpy.mockRestore();
  });
});
