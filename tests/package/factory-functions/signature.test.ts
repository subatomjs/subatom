import { describe, expect, it } from "vitest";
import {
	sign,
	unsign,
} from "../../../package/core/factory-functions/utils/signature.js";

describe("Signature Utility (sign & unsign)", () => {
	const secret = "super-secure-secret-key-12345";
	const payload = "session_xyz_789";

	it("should sign a string using HMAC-SHA256 in base64url format", () => {
		const signed = sign(payload, secret);
		expect(signed).toBeTypeOf("string");
		expect(signed.startsWith(`${payload}.`)).toBe(true);
		expect(signed.split(".").length).toBe(2);
	});

	it("should accurately unsign a valid signed token", () => {
		const signed = sign(payload, secret);
		const unsigned = unsign(signed, secret);
		expect(unsigned).toBe(payload);
	});

	it("should fail unsigning if the secret is incorrect", () => {
		const signed = sign(payload, secret);
		const unsigned = unsign(signed, "wrong-secret-key");
		expect(unsigned).toBe(false);
	});

	it("should fail unsigning if the payload has been tampered with", () => {
		const signed = sign(payload, secret);
		const tampered = `tampered_${signed}`;
		expect(unsign(tampered, secret)).toBe(false);
	});

	it("should fail unsigning if the signature hash has been modified", () => {
		const signed = sign(payload, secret);
		const parts = signed.split(".");
		const tampered = `${parts[0]}.${parts[1]}xyz`;
		expect(unsign(tampered, secret)).toBe(false);
	});

	it("should return false if the string contains no separator dot", () => {
		expect(unsign("nodothere", secret)).toBe(false);
	});

	it("should return false if the signature part length does not match expected length", () => {
		const signed = sign(payload, secret);
		const shortSignature = signed.slice(0, -3);
		expect(unsign(shortSignature, secret)).toBe(false);
	});

	it("should correctly handle payloads that contain dots", () => {
		const complexPayload = "user.id.42.token";
		const signed = sign(complexPayload, secret);
		const unsigned = unsign(signed, secret);
		expect(unsigned).toBe(complexPayload);
	});
});
