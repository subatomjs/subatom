import type {
	IPipelineContext,
	ISerializer,
} from "../../../../types/framework/pipeline/IPipeline.js";

export class SerializerError extends Error {
	public readonly serializerName: string | undefined;
	public override readonly cause?: unknown;

	constructor(serializerName: string | undefined, cause: unknown) {
		const label = serializerName ? `"${serializerName}"` : "(anonymous)";
		const causeMsg = cause instanceof Error ? cause.message : String(cause);
		super(`[Subatom] Serializer ${label} threw: ${causeMsg}`);
		this.name = "SerializerError";
		this.serializerName = serializerName;
		this.cause = cause;
	}
}

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
