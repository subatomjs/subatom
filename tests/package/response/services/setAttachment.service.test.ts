import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { setAttachment } from "../../../../package/core/http/response/services/setAttachment.service.js";

describe("setAttachment.service", () => {
	function createMockServerResponse() {
		return {
			setHeader: vi.fn(),
		} as unknown as ServerResponse;
	}

	it("should set Content-Disposition to attachment when no filename is given", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();

		setAttachment(raw, headersMap, false);

		expect(headersMap.get("content-disposition")).toBe("attachment");
		expect(raw.setHeader).toHaveBeenCalledWith(
			"Content-Disposition",
			"attachment",
		);
	});

	it("should encode standard ASCII filename with RFC 5987 formatting", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();

		setAttachment(raw, headersMap, false, "report.pdf");

		expect(headersMap.get("content-disposition")).toBe(
			`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
		);
	});

	it("should sanitize non-ASCII characters in fallback and UTF-8 encode filename*", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();

		setAttachment(raw, headersMap, false, 'rapport_détail_"2026"*.pdf');

		const expectedHeader = `attachment; filename="rapport_d_tail_'2026'*.pdf"; filename*=UTF-8''rapport_d%C3%A9tail_%222026%22%2A.pdf`;

		expect(headersMap.get("content-disposition")).toBe(expectedHeader);
	});

	it("should prevent CRLF header injection in filename", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();

		expect(() =>
			setAttachment(raw, headersMap, false, "bad\r\nfile.pdf"),
		).toThrowError(/Refusing to set header "Content-Disposition"/);
	});
});
