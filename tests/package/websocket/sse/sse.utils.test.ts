import { describe, expect, it } from "vitest";
import {
	formatSSEComment,
	formatSSEEvent,
} from "../../../../package/core/websocket/sse/sse.utils.js";

describe("SSE Utilities", () => {
	describe("formatSSEEvent", () => {
		it("should format single-line text data event", () => {
			const result = formatSSEEvent({ data: "hello world" });
			expect(result).toBe("data: hello world\n\n");
		});

		it("should format structured event with id, custom event name, and retry", () => {
			const result = formatSSEEvent({
				id: "123",
				event: "user_joined",
				retry: 5000,
				data: "Alice",
			});
			expect(result).toBe(
				"id: 123\nevent: user_joined\nretry: 5000\ndata: Alice\n\n",
			);
		});

		it("should JSON serialize non-string data objects", () => {
			const payload = { userId: 42, role: "admin" };
			const result = formatSSEEvent({ data: payload });
			expect(result).toBe(`data: ${JSON.stringify(payload)}\n\n`);
		});

		it("should split multiline string payloads across multiple data lines", () => {
			const multiLine = "Line 1\nLine 2\nLine 3";
			const result = formatSSEEvent({ data: multiLine });
			expect(result).toBe("data: Line 1\ndata: Line 2\ndata: Line 3\n\n");
		});

		it("should sanitize CR/LF from id and event fields to prevent header injection", () => {
			const result = formatSSEEvent({
				id: "id1\r\ninjected-field: evil",
				event: "event1\nevil-header: foo",
				data: "safe",
			});
			expect(result).toBe(
				"id: id1injected-field: evil\nevent: event1evil-header: foo\ndata: safe\n\n",
			);
		});
	});

	describe("formatSSEComment", () => {
		it("should format comment line properly", () => {
			expect(formatSSEComment("ping")).toBe(": ping\n\n");
		});

		it("should sanitize newlines in comments", () => {
			expect(formatSSEComment("ping\nfake: value\r")).toBe(
				": pingfake: value\n\n",
			);
		});
	});
});
