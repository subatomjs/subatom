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
	const normalizedContentType = contentType
		?.split(";")[0]
		?.trim()
		.toLowerCase();

	for (const serializer of serializers) {
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
