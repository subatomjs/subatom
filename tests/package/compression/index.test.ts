import { describe, expect, it } from "vitest";
import {
    createCompression,
    serveStaticPrecompressed,
    SubatomCompression,
    SubatomStaticPrecompress,
} from "../../../package/core/http/compression/index.js";

describe("index.ts - Public Facade", () => {
    it("exports SubatomCompression and SubatomStaticPrecompress classes", () => {
        expect(SubatomCompression).toBeDefined();
        expect(SubatomStaticPrecompress).toBeDefined();
    });

    it("creates a compression middleware instance via createCompression()", () => {
        const middleware = createCompression({ threshold: 512 });
        expect(typeof middleware).toBe("function");
        expect(middleware.length).toBe(3); // (req, res, next)
    });

    it("creates a static precompression middleware instance via serveStaticPrecompressed()", () => {
        const middleware = serveStaticPrecompressed({ publicDir: "./public" });
        expect(typeof middleware).toBe("function");
        expect(middleware.length).toBe(3); // (req, res, next)
    });
});