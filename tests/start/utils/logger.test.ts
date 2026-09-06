import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../../start/utils/logger.js";

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("standard log levels", () => {
    it("should log info messages with and without scope/context", () => {
      logger.info("Server initialized");
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/INFO .*SUBATOM.*Server initialized/)
      );

      logger.info("Connected", { scope: "BOOT", host: "127.0.0.1", port: 3000 });
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[BOOT\].*Connected.*host=127.0.0.1.*port=3000/)
      );
    });

    it("should log success, warn, and debug messages", () => {
      logger.success("Build OK");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("OK"));

      logger.warn("Deprecated configuration");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("WARN"));

      logger.debug("Debugging query parameters");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("DEBUG"));
    });

    it("should output error messages to console.error", () => {
      logger.error("Failed to start service", { scope: "SERVER" });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/ERROR.*\[SERVER\].*Failed to start service/)
      );
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe("context value formatting", () => {
    it("should correctly serialize strings, errors, nulls, undefined, and objects", () => {
      const err = new Error("Connection timed out");
      logger.info("Diagnostics", {
        err,
        nullVal: null,
        undefVal: undefined,
        metadata: { id: 101, valid: true },
        num: 42,
      });

      const callArg = logSpy.mock.calls[0][0];
      expect(callArg).toContain("err=Connection timed out");
      expect(callArg).toContain("nullVal=null");
      expect(callArg).toContain("undefVal=undefined");
      expect(callArg).toContain('metadata={"id":101,"valid":true}');
      expect(callArg).toContain("num=42");
    });

    it("should handle circular references without throwing", () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(() => {
        logger.info("Cycle test", { circular });
      }).not.toThrow();

      const callArg = logSpy.mock.calls[0][0];
      expect(callArg).toContain("circular=[object]");
    });

    it("should ignore empty context objects and context with only scope", () => {
      logger.info("No context", {});
      logger.info("Only scope", { scope: "CONFIG" });

      expect(logSpy.mock.calls[0][0]).toMatch(/No context$/);
      expect(logSpy.mock.calls[1][0]).toMatch(/\[CONFIG\] Only scope$/);
    });
  });

  describe("server() and shutdown()", () => {
    it("should print server running info with default and custom protocols", () => {
      logger.server({ host: "localhost", port: 3000 });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Server running"));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("http://localhost:3000"));

      logger.server({ host: "subatom.dev", port: 443, protocol: "https" });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("https://subatom.dev:443"));
    });

    it("should output shutdown logs", () => {
      logger.shutdown();
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[SHUTDOWN\].*Server shutting down/));

      logger.shutdown("Custom termination notice");
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[SHUTDOWN\].*Custom termination notice/));
    });
  });

  describe("documentation()", () => {
    it("should print all supplied documentation endpoints", () => {
      logger.documentation({
        swagger: "http://localhost:3000/docs",
        redoc: "http://localhost:3000/redoc",
        openapi: "http://localhost:3000/openapi.json",
      });

      const logs = logSpy.mock.calls.map((c:any) => c[0]).join("\n");
      expect(logs).toContain("Documentation");
      expect(logs).toContain("Swagger UI");
      expect(logs).toContain("ReDoc");
      expect(logs).toContain("OpenAPI");
    });

    it("should return early when no documentation URLs are given", () => {
      logger.documentation({});
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe("startup()", () => {
    it("should print complete startup banners, routes, and docs", () => {
      logger.startup({
        host: "0.0.0.0",
        port: 8080,
        protocol: "http",
        routes: 12,
        documentation: {
          swagger: "http://0.0.0.0:8080/docs",
          redoc: "http://0.0.0.0:8080/redoc",
          openapi: "http://0.0.0.0:8080/openapi.json",
        },
      });

      const output = logSpy.mock.calls.map((c:any) => c[0]).join("\n");
      expect(output).toContain("SubAtom");
      expect(output).toContain("TypeScript HTTP Framework");
      expect(output).toContain("Routes registered");
      expect(output).toContain("routes=12");
      expect(output).toContain("Server listening");
      expect(output).toContain("Swagger UI");
      expect(output).toContain("ReDoc");
      expect(output).toContain("OpenAPI");
    });

    it("should handle omitted routes and missing documentation", () => {
      logger.startup({ host: "127.0.0.1", port: 5000 });
      const output = logSpy.mock.calls.map((c:any) => c[0]).join("\n");
      expect(output).not.toContain("Routes registered");
      expect(output).not.toContain("Documentation");
    });


    it("should print individual documentation endpoints when partially provided", () => {
      logger.startup({
        host: "127.0.0.1",
        port: 8080,
        documentation: {
          swagger: "http://127.0.0.1:8080/docs",
        },
      });

      let output = logSpy.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).toContain("Swagger UI");
      expect(output).not.toContain("ReDoc");
      expect(output).not.toContain("OpenAPI");

      logSpy.mockClear();

      logger.startup({
        host: "127.0.0.1",
        port: 8080,
        documentation: {
          redoc: "http://127.0.0.1:8080/redoc",
        },
      });

      output = logSpy.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).toContain("ReDoc");

      logSpy.mockClear();

      logger.startup({
        host: "127.0.0.1",
        port: 8080,
        documentation: {
          openapi: "http://127.0.0.1:8080/openapi.json",
        },
      });

      output = logSpy.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).toContain("OpenAPI");
    });

    it("should handle documentation object provided with all undefined properties", () => {
      logger.startup({
        host: "127.0.0.1",
        port: 8080,
        documentation: {},
      });

      const output = logSpy.mock.calls.map((c: any) => c[0]).join("\n");
      expect(output).not.toContain("Swagger UI");
      expect(output).not.toContain("ReDoc");
      expect(output).not.toContain("OpenAPI");
    });
  });
});