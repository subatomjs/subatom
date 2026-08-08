import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../../../types/http/IMiddleware.js";

export function registerMiddleware(
	middlewares: MiddlewareHandler[],
	errorMiddlewares: ErrorMiddlewareHandler[],
	fnOrPrefix: any,
): void {
	if (typeof fnOrPrefix === "function") {
		if (fnOrPrefix.length === 4) {
			errorMiddlewares.push(fnOrPrefix);
		} else {
			middlewares.push(fnOrPrefix);
		}
	}
}
