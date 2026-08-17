import { describe, expect, it } from "vitest";
import { compileFileValidator } from "../../../package/core/validation/validators/file.validator.js";

describe("compileFileValidator", () => {
    it("should reject non-file objects", async () => {
        const validator = compileFileValidator({ type: "file" });

        expect(await validator(null, "avatar")).toEqual([
            { path: "avatar", rule: "type", message: "Expected a parsed file object", received: "object" },
        ]);
        expect(await validator({}, "avatar")).toEqual([
            { path: "avatar", rule: "type", message: "Expected a parsed file object", received: "object" },
        ]);
        expect(await validator("file.png", "avatar")).toEqual([
            { path: "avatar", rule: "type", message: "Expected a parsed file object", received: "string" },
        ]);
    });

    it("should validate file size limits", async () => {
        const validator = compileFileValidator({
            type: "file",
            maxSize: 1024,
        });

        const validFile = { mimetype: "image/png", size: 1024 };
        expect(await validator(validFile, "avatar")).toHaveLength(0);

        const invalidFile = { mimetype: "image/png", size: 2048 };
        expect(await validator(invalidFile, "avatar")).toEqual([
            {
                path: "avatar",
                rule: "maxSize",
                message: "File size 2048 bytes exceeds maximum of 1024 bytes",
                expected: 1024,
                received: 2048,
            },
        ]);
    });

    it("should validate allowed MIME types", async () => {
        const validator = compileFileValidator({
            type: "file",
            allowedMimeTypes: ["image/jpeg", "image/png"],
        });

        expect(await validator({ mimetype: "image/png" }, "avatar")).toHaveLength(0);

        const failRes = await validator({ mimetype: "application/pdf" }, "avatar");
        expect(failRes).toEqual([
            {
                path: "avatar",
                rule: "allowedMimeTypes",
                message: "MIME type not allowed. Expected one of: image/jpeg, image/png",
                expected: ["image/jpeg", "image/png"],
                received: "application/pdf",
            },
        ]);
    });
});