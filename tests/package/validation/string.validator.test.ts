import { describe, expect, it } from "vitest";
import { compileStringValidator } from "../../../package/core/validation/validators/string.validator.js";

describe("compileStringValidator", () => {
    it("should reject non-string values", async () => {
        const validator = compileStringValidator({ type: "string" });

        const numberRes = await validator(123, "username");
        expect(numberRes).toEqual([
            { path: "username", rule: "type", message: "Expected string", received: "number" },
        ]);

        const boolRes = await validator(true, "username");
        expect(boolRes[0].rule).toBe("type");

        const objRes = await validator({}, "username");
        expect(objRes[0].rule).toBe("type");

        const arrRes = await validator([], "username");
        expect(arrRes[0].rule).toBe("type");
    });

    it("should validate minLength boundary conditions", async () => {
        const validator = compileStringValidator({ type: "string", minLength: 3 });

        expect(await validator("abc", "prop")).toHaveLength(0);
        expect(await validator("abcd", "prop")).toHaveLength(0);

        const failRes = await validator("ab", "prop");
        expect(failRes).toEqual([
            {
                path: "prop",
                rule: "minLength",
                message: "Must be at least 3 characters",
                expected: 3,
            },
        ]);

        const emptyRes = await validator("", "prop");
        expect(emptyRes).toEqual([
            {
                path: "prop",
                rule: "minLength",
                message: "Must be at least 3 characters",
                expected: 3,
            },
        ]);
    });

    it("should validate maxLength boundary conditions", async () => {
        const validator = compileStringValidator({ type: "string", maxLength: 5 });

        expect(await validator("", "prop")).toHaveLength(0);
        expect(await validator("12345", "prop")).toHaveLength(0);

        const failRes = await validator("123456", "prop");
        expect(failRes).toEqual([
            {
                path: "prop",
                rule: "maxLength",
                message: "Must be at most 5 characters",
                expected: 5,
            },
        ]);
    });

    it("should validate custom regex pattern", async () => {
        const validator = compileStringValidator({
            type: "string",
            pattern: "^[A-Z]{3}-\\d{3}$",
        });

        expect(await validator("ABC-123", "code")).toHaveLength(0);

        const failRes = await validator("abc-123", "code");
        expect(failRes).toEqual([
            {
                path: "code",
                rule: "pattern",
                message: "Does not match required pattern",
            },
        ]);
    });

    it("should validate built-in formats (email, url, uri, uuid, date, ipv4)", async () => {
        const emailValidator = compileStringValidator({ type: "string", format: "email" });
        expect(await emailValidator("user@example.com", "email")).toHaveLength(0);
        expect(await emailValidator("invalid-email", "email")).toEqual([
            { path: "email", rule: "format", message: "Invalid email format" },
        ]);

        const urlValidator = compileStringValidator({ type: "string", format: "url" });
        expect(await urlValidator("https://subatom.dev/docs", "url")).toHaveLength(0);
        expect(await urlValidator("ftp://files.example.com", "url")).toHaveLength(0);
        expect(await urlValidator("not a url", "url")).toEqual([
            { path: "url", rule: "format", message: "Invalid url format" },
        ]);

        const uriValidator = compileStringValidator({ type: "string", format: "uri" });
        expect(await uriValidator("https://subatom.dev", "uri")).toHaveLength(0);
        expect(await uriValidator("invalid uri", "uri")).toEqual([
            { path: "uri", rule: "format", message: "Invalid uri format" },
        ]);

        const uuidValidator = compileStringValidator({ type: "string", format: "uuid" });
        expect(await uuidValidator("123e4567-e89b-12d3-a456-426614174000", "id")).toHaveLength(0);
        expect(await uuidValidator("invalid-uuid", "id")).toEqual([
            { path: "id", rule: "format", message: "Invalid uuid format" },
        ]);

        const dateValidator = compileStringValidator({ type: "string", format: "date" });
        expect(await dateValidator("2026-08-17", "date")).toHaveLength(0);
        expect(await dateValidator("17-08-2026", "date")).toEqual([
            { path: "date", rule: "format", message: "Invalid date format" },
        ]);

        const ipv4Validator = compileStringValidator({ type: "string", format: "ipv4" });
        expect(await ipv4Validator("127.0.0.1", "ip")).toHaveLength(0);
        expect(await ipv4Validator("255.255.255.255", "ip")).toHaveLength(0);
        expect(await ipv4Validator("256.0.0.1", "ip")).toEqual([
            { path: "ip", rule: "format", message: "Invalid ipv4 format" },
        ]);
    });

    it("should ignore unsupported formats gracefully", async () => {
        const validator = compileStringValidator({ type: "string", format: "unsupported_format" });
        expect(await validator("any-value", "field")).toHaveLength(0);
    });

    it("should validate enum constraints", async () => {
        const validator = compileStringValidator({
            type: "string",
            enum: ["admin", "editor", "viewer"],
        });

        expect(await validator("admin", "role")).toHaveLength(0);
        expect(await validator("editor", "role")).toHaveLength(0);

        const failRes = await validator("guest", "role");
        expect(failRes).toEqual([
            {
                path: "role",
                rule: "enum",
                message: "Must be one of: admin, editor, viewer",
            },
        ]);
    });

    it("should collect multiple issues on a single string", async () => {
        const validator = compileStringValidator({
            type: "string",
            minLength: 10,
            maxLength: 2,
            format: "email",
        });

        const issues = await validator("a", "test");
        expect(issues).toHaveLength(2);
        expect(issues.map((i) => i.rule)).toEqual(["minLength", "format"]);
    });
});