import { describe, expect, it } from "vitest";
import {
  ValidationError,
  type ValidationIssue,
} from "../../../package/core/validation/ValidationError.js";

describe("ValidationError", () => {
  it("should instantiate with correct properties and default status code", () => {
    const issues: ValidationIssue[] = [
      {
        path: "body.email",
        rule: "format",
        message: "Invalid email format",
        expected: "email",
        received: "not-an-email",
      },
    ];

    const error = new ValidationError(issues);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe("ValidationError");
    expect(error.message).toBe("Request validation failed");
    expect((error as any).statusCode).toBe(422);
    expect((error as any).errorCode).toBe("VALIDATION_ERROR");
    expect((error as any).details).toEqual(issues);
    expect((error as any).isOperational).toBe(true);
  });

  it("should preserve empty issues array", () => {
    const error = new ValidationError([]);
    expect((error as any).details).toEqual([]);
    expect(error.name).toBe("ValidationError");
  });
});
