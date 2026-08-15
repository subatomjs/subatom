import {
	type IInterceptor,
	type ISerializer,
	type ITransformer,
	sortedByPriority,
} from "../../../../types/framework/pipeline/IPipeline.js";

function assertPlainObject(
	value: unknown,
	label: string,
): asserts value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new TypeError(`[Subatom] ${label} must be a plain object.`);
	}
}

function resortInPlace<T extends { priority?: number }>(bucket: T[]): void {
	const sorted = sortedByPriority(bucket);
	bucket.length = 0;
	bucket.push(...sorted);
}

export function registerTransformer(
	bucket: ITransformer[],
	transformer: ITransformer,
): void {
	assertPlainObject(transformer, "transformer()");

	const hasAnyHook =
		typeof transformer.beforeRequest === "function" ||
		typeof transformer.afterRequest === "function" ||
		typeof transformer.beforeResponse === "function" ||
		typeof transformer.afterResponse === "function";

	if (!hasAnyHook) {
		throw new TypeError(
			"[Subatom] transformer() requires at least one of: " +
				"beforeRequest, afterRequest, beforeResponse, afterResponse.",
		);
	}

	bucket.push(transformer);
	resortInPlace(bucket);
}

export function registerInterceptor(
	bucket: IInterceptor[],
	interceptor: IInterceptor,
): void {
	assertPlainObject(interceptor, "intercept()");

	if (typeof interceptor.intercept !== "function") {
		throw new TypeError(
			"[Subatom] intercept() requires an `intercept(ctx, next)` function.",
		);
	}

	bucket.push(interceptor);
	resortInPlace(bucket);
}

export function registerSerializer(
	bucket: ISerializer[],
	serializer: ISerializer,
): void {
	assertPlainObject(serializer, "serializer()");

	if (typeof serializer.serialize !== "function") {
		throw new TypeError(
			"[Subatom] serializer() requires a `serialize(data, ctx)` function.",
		);
	}

	bucket.push(serializer);
	resortInPlace(bucket);
}
