import { describe, it, expect } from "vitest";
import { getMimeType, MIME_TYPES } from "../../../package/core/utils/mime.js";

describe("getMimeType", () => {
  describe("Extension mapping", () => {
    it("resolves web & text formats correctly", () => {
      expect(getMimeType("index.html")).toBe("text/html; charset=utf-8");
      expect(getMimeType("styles.css")).toBe("text/css; charset=utf-8");
      expect(getMimeType("app.js")).toBe("text/javascript; charset=utf-8");
      expect(getMimeType("component.tsx")).toBe("text/typescript; charset=utf-8");
      expect(getMimeType("data.json")).toBe("application/json; charset=utf-8");
      expect(getMimeType("README.md")).toBe("text/markdown; charset=utf-8");
    });

    it("resolves images and media formats correctly", () => {
      expect(getMimeType("/path/to/image.png")).toBe("image/png");
      expect(getMimeType("photo.jpg")).toBe("image/jpeg");
      expect(getMimeType("vector.svg")).toBe("image/svg+xml");
      expect(getMimeType("audio.mp3")).toBe("audio/mpeg");
      expect(getMimeType("movie.mp4")).toBe("video/mp4");
      expect(getMimeType("font.woff2")).toBe("font/woff2");
    });

    it("resolves documents and archive formats correctly", () => {
      expect(getMimeType("document.pdf")).toBe("application/pdf");
      expect(getMimeType("archive.zip")).toBe("application/zip");
      expect(getMimeType("binary.wasm")).toBe("application/wasm");
    });
  });

  describe("Case insensitivity and path handling", () => {
    it("handles uppercase and mixed-case extensions", () => {
      expect(getMimeType("PHOTO.PNG")).toBe("image/png");
      expect(getMimeType("document.Docx")).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(getMimeType("data.JSON")).toBe("application/json; charset=utf-8");
    });

    it("resolves files nested in complex directory paths", () => {
      expect(getMimeType("/var/www/public/assets/bundle.min.js")).toBe(
        "text/javascript; charset=utf-8",
      );
      expect(getMimeType("relative/dir/sub/archive.tar.gz")).toBe("application/gzip");
    });
  });

  describe("Fallback behavior", () => {
    it("falls back to application/octet-stream for unknown extensions", () => {
      expect(getMimeType("custom.xyz")).toBe("application/octet-stream");
      expect(getMimeType("binary.unknown")).toBe("application/octet-stream");
    });

    it("falls back to application/octet-stream for files without extensions", () => {
      expect(getMimeType("Dockerfile")).toBe("application/octet-stream");
      expect(getMimeType(".env")).toBe("application/octet-stream");
      expect(getMimeType("")).toBe("application/octet-stream");
    });
  });
});