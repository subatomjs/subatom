import { createHmac, timingSafeEqual } from "node:crypto";

export function sign(val: string, secret: string): string {
	const hmac = createHmac("sha256", secret).update(val).digest("base64url");
	return `${val}.${hmac}`;
}

export function unsign(signed: string, secret: string): string | false {
	const idx = signed.lastIndexOf(".");
	if (idx === -1) return false;

	const val = signed.slice(0, idx);
	const expected = sign(val, secret);

	const a = Buffer.from(signed);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	if (!timingSafeEqual(a, b)) return false;

	return val;
}
