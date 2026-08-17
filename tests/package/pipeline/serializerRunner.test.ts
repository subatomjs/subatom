import { describe, expect, it } from "vitest";
import {
	runSerializers,
	SerializerError,
} from "../../../package/core/pipeline/modifier/services/serializerRunner.service.js";
import type {
	IPipelineContext,
	ISerializer,
} from "../../../package/types/framework/pipeline/IPipeline.js";

describe("runSerializers", () => {
	const dummyCtx: IPipelineContext = {
		req: {} as any,
		res: {} as any,
		state: {},
	};

	it("matches contentType and executes serialization", async () => {
		const jsonSerializer: ISerializer = {
			name: "json",
			contentType: "application/json",
			serialize: (data) => JSON.stringify(data),
		};
		const xmlSerializer: ISerializer = {
			name: "xml",
			contentType: "application/xml",
			serialize: () => "<xml></xml>",
		};

		const result = await runSerializers(
			[jsonSerializer, xmlSerializer],
			{ a: 1 },
			dummyCtx,
			"application/json; charset=utf-8",
		);

		expect(result).toBe(JSON.stringify({ a: 1 }));
	});

	it("returns data unchanged when no serializer matches", async () => {
		const xmlSerializer: ISerializer = {
			contentType: "application/xml",
			serialize: () => "<xml/>",
		};

		const data = { raw: "data" };
		const result = await runSerializers(
			[xmlSerializer],
			data,
			dummyCtx,
			"text/plain",
		);
		expect(result).toBe(data);
	});

	it("wraps execution errors in SerializerError", async () => {
		const faultySerializer: ISerializer = {
			name: "Faulty",
			serialize: () => {
				throw new Error("Serialization broken");
			},
		};

		await expect(
			runSerializers([faultySerializer], {}, dummyCtx),
		).rejects.toThrow(SerializerError);
	});
});
