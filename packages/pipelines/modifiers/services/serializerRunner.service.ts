/**
 * @fileoverview Runs the appropriate serializer by content type, transforms response data,
 * and wraps serialization failures in SerializerError.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { SerializerError } from "../../../errors/modifiers/SerializerError.js";
import type { IPipelineContext, ISerializer } from "../../pipeline.types.js";

export async function runSerializers(
	serializers: ISerializer[],
	data: unknown,
	ctx: IPipelineContext,
	contentType?: string,
): Promise<unknown> {
	// If no Content-Type was explicitly set prior to serialization,
	// infer standard application/json if data is an object, or text/plain otherwise.
	const effectiveContentType =
		contentType ||
		ctx.res.get?.("content-type")?.toString() ||
		(typeof data === "object" && data !== null
			? "application/json"
			: undefined);

	const normalizedContentType = effectiveContentType
		?.split(";")[0]
		?.trim()
		.toLowerCase();

	for (const serializer of serializers) {
		// If serializer has a contentType constraint, match it against normalizedContentType
		if (serializer.contentType) {
			const expectedContentType = serializer.contentType
				.split(";")[0]
				?.trim()
				.toLowerCase();

			if (expectedContentType !== normalizedContentType) {
				continue;
			}
		}

		try {
			const result = await serializer.serialize(data, ctx);
			return result === undefined ? data : result;
		} catch (cause) {
			throw new SerializerError(serializer.name, cause);
		}
	}

	return data;
}
