import { describe, it, expect } from "vitest";
// If parseEnv.ts is at package/config/parseEnv.ts or package/config/env/parseEnv.ts:
import { parseEnv } from "../../../package/config/env/parseEnv.js"; 
// (or "../../../package/config/env/parseEnv.js" if nested in an env directory)

describe("parseEnv", () => {
    it("parses standard unquoted key-value pairs and trims whitespace", () => {
        const input = "PORT=8080\nHOST=localhost \n  NODE_ENV=production";
        const result = parseEnv(input);
        expect(result).toEqual({
            PORT: "8080",
            HOST: "localhost",
            NODE_ENV: "production",
        });
    });

    it("handles export prefix correctly", () => {
        const input = "export API_KEY=subatom-123\nexport   DATABASE_URL=postgres://localhost:5432/db";
        const result = parseEnv(input);
        expect(result).toEqual({
            API_KEY: "subatom-123",
            DATABASE_URL: "postgres://localhost:5432/db",
        });
    });

    it("parses single-quoted values and unescapes single quotes", () => {
        const input = "SECRET='my\\'secret\\'value'\nPLAIN='simple'";
        const result = parseEnv(input);
        expect(result).toEqual({
            SECRET: "my'secret'value",
            PLAIN: "simple",
        });
    });

    it("parses double-quoted values with escaped newlines, returns, and quotes", () => {
        const input = 'JSON_STR="{\\"name\\": \\"subatom\\"}"\nMULTILINE="line1\\nline2\\rline3"';
        const result = parseEnv(input);
        expect(result).toEqual({
            JSON_STR: '{"name": "subatom"}',
            MULTILINE: "line1\nline2\rline3",
        });
    });

    it("parses backtick-quoted values and unescapes backticks", () => {
        const input = "TEMPLATE=`Hello \\`World\\``";
        const result = parseEnv(input);
        expect(result).toEqual({
            TEMPLATE: "Hello `World`",
        });
    });

    it("ignores trailing inline comments on unquoted values", () => {
        const input = "PORT=3000 # Server port\nDEBUG=true#inline comment";
        const result = parseEnv(input);
        expect(result).toEqual({
            PORT: "3000",
            DEBUG: "true",
        });
    });

    it("normalizes CRLF line endings to LF", () => {
        const input = "KEY1=val1\r\nKEY2=val2\r\nKEY3=val3";
        const result = parseEnv(input);
        expect(result).toEqual({
            KEY1: "val1",
            KEY2: "val2",
            KEY3: "val3",
        });
    });

    it("returns empty object on empty string or comments-only content", () => {
        expect(parseEnv("")).toEqual({});
        expect(parseEnv("# just a comment\n# another comment")).toEqual({});
    });

    it("supports keys with dots, hyphens, and underscores", () => {
        const input = "app.service-name_v1=alpha";
        const result = parseEnv(input);
        expect(result).toEqual({
            "app.service-name_v1": "alpha",
        });
    });
});