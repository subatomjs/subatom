import os from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import path from "node:path";
import { SubatomStaticPrecompress } from "../../../package/core/http/compression/staticPrecompress.js";





describe("staticPrecompress.ts - SubatomStaticPrecompress", () => {
    const publicDir = path.join(os.tmpdir(), `subatom-static-${Date.now()}`);

    beforeAll(() => {
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
        }
    });

    afterAll(() => {
        if (fs.existsSync(publicDir)) {
            fs.rmSync(publicDir, { recursive: true, force: true });
        }
    });

    const createReqRes = (method = "GET", url = "/index.html", acceptEncoding = "br, gzip") => {
        const socket = new Socket();
        const req = new IncomingMessage(socket);
        req.method = method;
        req.url = url;
        req.headers = { "accept-encoding": acceptEncoding };
        const res = new ServerResponse(req);
        return { req, res };
    };

    it("resolves precompressed brotli file (.br) when available and accepted", () => {
        const filePath = path.join(publicDir, "index.html");
        const brPath = path.join(publicDir, "index.html.br");
        fs.writeFileSync(filePath, "<html>Original</html>");
        fs.writeFileSync(brPath, "<html>Brotli</html>");

        const handler = new SubatomStaticPrecompress({ publicDir });
        const { req } = createReqRes("GET", "/index.html", "br");

        const resolved = handler.resolvePrecompressedFile(req, filePath);
        expect(resolved.targetPath).toBe(brPath);
        expect(resolved.encoding).toBe("br");
    });

    it("falls back to priority algorithms (.gz) if preferred is missing", () => {
        const filePath = path.join(publicDir, "app.js");
        const gzPath = path.join(publicDir, "app.js.gz");
        fs.writeFileSync(filePath, "console.log('original');");
        fs.writeFileSync(gzPath, "console.log('gzip');");

        const handler = new SubatomStaticPrecompress({ publicDir });
        const { req } = createReqRes("GET", "/app.js", "br, gzip");

        const resolved = handler.resolvePrecompressedFile(req, filePath);
        expect(resolved.targetPath).toBe(gzPath);
        expect(resolved.encoding).toBe("gzip");
    });

    it("returns uncompressed path if client requests identity", () => {
        const filePath = path.join(publicDir, "data.json");
        fs.writeFileSync(filePath, "{}");
        fs.writeFileSync(`${filePath}.br`, "{}");

        const handler = new SubatomStaticPrecompress({ publicDir });
        const { req } = createReqRes("GET", "/data.json", "identity");

        const resolved = handler.resolvePrecompressedFile(req, filePath);
        expect(resolved.targetPath).toBe(filePath);
        expect(resolved.encoding).toBeNull();
    });

    it("skips non-GET and non-HEAD requests in middleware", () => {
        const handler = new SubatomStaticPrecompress({ publicDir });
        const middleware = handler.middleware();
        const { req, res } = createReqRes("POST", "/index.html");
        const next = vi.fn();

        middleware(req, res, next);
        expect(next).toHaveBeenCalledOnce();
    });

    it("passes control to next() if file does not exist or is a directory", () => {
        const handler = new SubatomStaticPrecompress({ publicDir });
        const middleware = handler.middleware();
        const { req, res } = createReqRes("GET", "/non-existent.txt");
        const next = vi.fn();

        middleware(req, res, next);
        expect(next).toHaveBeenCalledOnce();
    });

    it("prevents directory traversal attacks via path sanitization", () => {
        const handler = new SubatomStaticPrecompress({ publicDir });
        const middleware = handler.middleware();
        const { req, res } = createReqRes("GET", "/../../etc/passwd");
        const next = vi.fn();

        middleware(req, res, next);
        expect(next).toHaveBeenCalledOnce();
    });

    it("serves precompressed file with correct headers for GET request", async () => {
        const filePath = path.join(publicDir, "style.css");
        const gzPath = path.join(publicDir, "style.css.gz");
        fs.writeFileSync(filePath, "body { color: black; }");
        fs.writeFileSync(gzPath, "gzipped-body");

        const handler = new SubatomStaticPrecompress({ publicDir });
        const middleware = handler.middleware();
        const { req, res } = createReqRes("GET", "/style.css", "gzip");
        const next = vi.fn();

        await new Promise<void>((resolve) => {
            res.on("finish", resolve);
            res.on("close", resolve);
            middleware(req, res, next);
            // Close after pipeline starts
            setTimeout(resolve, 50);
        });

        expect(res.getHeader("Content-Encoding")).toBe("gzip");
        expect(res.getHeader("Content-Type")).toBe("text/css; charset=utf-8");
        expect(res.getHeader("Vary")).toContain("Accept-Encoding");
        expect(next).not.toHaveBeenCalled();
    });

    it("handles HEAD requests without streaming body", () => {
        const filePath = path.join(publicDir, "test.html");
        const brPath = path.join(publicDir, "test.html.br");
        fs.writeFileSync(filePath, "<h1>Test</h1>");
        fs.writeFileSync(brPath, "<h1>Test-Br</h1>");

        const handler = new SubatomStaticPrecompress({ publicDir });
        const middleware = handler.middleware();
        const { req, res } = createReqRes("HEAD", "/test.html", "br");
        const next = vi.fn();
        const endSpy = vi.spyOn(res, "end");

        middleware(req, res, next);

        expect(res.statusCode).toBe(200);
        expect(res.getHeader("Content-Encoding")).toBe("br");
        expect(endSpy).toHaveBeenCalledOnce();
        expect(next).not.toHaveBeenCalled();
    });
});