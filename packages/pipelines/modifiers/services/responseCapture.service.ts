/**
 * @fileoverview Captures terminal response calls through a proxy, prevents duplicate responses,
 * supports method chaining, and later flushes the captured response.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IResponse } from "../../../core/http/response/types/response.types.js";
import type {
	ICapturedResponse,
	IResponseCapture,
} from "../types/modifiers.types.js";

const DEFAULT_TERMINAL_METHODS = ["json", "send", "end"];

export function createResponseCapture(
	realRes: IResponse,
	terminalMethods: string[] = DEFAULT_TERMINAL_METHODS,
): IResponseCapture {
	let settled = false;
	let resolveCaptured!: (value: ICapturedResponse) => void;
	let rejectCaptured!: (reason?: unknown) => void;

	const captured = new Promise<ICapturedResponse>((resolve, reject) => {
		resolveCaptured = resolve;
		rejectCaptured = reject;
	});

	const target = realRes as unknown as Record<string, unknown>;

	const proxy = new Proxy(target, {
		get(t, prop, receiver) {
			if (
				prop === "headersSent" ||
				prop === "writableEnded" ||
				prop === "finished"
			) {
				return settled || Boolean(Reflect.get(t, prop, receiver));
			}

			const value = Reflect.get(t, prop, receiver);

			// Handle non-terminal methods (status, setHeader, etc.)
			if (typeof prop !== "string" || !terminalMethods.includes(prop)) {
				if (typeof value === "function") {
					return (...args: unknown[]) => {
						const result = value.apply(t, args);
						// Prevents method chaining (e.g., res.status(200).json()) from returning
						// the raw unproxied response object
						return result === t ? receiver : result;
					};
				}
				return value;
			}

			// Handle terminal methods (json, send, end)
			return (...args: unknown[]) => {
				if (settled) {
					throw new Error(
						`[Subatom] Response already sent — "${prop}" was called a second time.`,
					);
				}
				settled = true;
				resolveCaptured({ method: prop, args });
				return receiver;
			};
		},
	});

	return { res: proxy as unknown as IResponse, captured, rejectCaptured };
}

export function flushCapturedResponse(
	realRes: IResponse,
	method: string,
	args: unknown[],
): void {
	const fn = (
		realRes as unknown as Record<string, (...a: unknown[]) => unknown>
	)[method];
	if (typeof fn !== "function") {
		throw new Error(
			`[Subatom] Cannot flush response: "${method}" is not a function on IResponse.`,
		);
	}
	fn.apply(realRes, args);
}
