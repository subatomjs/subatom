import { describe, expect, it, vi } from "vitest";
import { redirect } from "../../../../package/core/http/response/services/redirect.service.js";

describe("redirect.service", () => {
	it("should call callback with valid 3xx status code and location", () => {
		const callback = vi.fn();

		redirect("/login", 302, callback);

		expect(callback).toHaveBeenCalledWith(302, "/login");
	});

	it("should throw SubatomError if status code is below 300", () => {
		const callback = vi.fn();

		expect(() => redirect("/home", 200, callback)).toThrowError(
			/Invalid redirect status code: 200/,
		);
		expect(callback).not.toHaveBeenCalled();
	});

	it("should throw SubatomError if status code is above 399", () => {
		const callback = vi.fn();

		expect(() => redirect("/error", 400, callback)).toThrowError(
			/Invalid redirect status code: 400/,
		);
		expect(callback).not.toHaveBeenCalled();
	});

	it("should throw on CRLF injection in target redirect URL", () => {
		const callback = vi.fn();

		expect(() =>
			redirect("https://subatom.dev\r\nSet-Cookie: evil", 301, callback),
		).toThrowError(/Refusing to set header "Location"/);
		expect(callback).not.toHaveBeenCalled();
	});
});
