import { Transform as NodeTransform } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
	createTransform,
	Transform,
} from "../../../package/core/http/streams/methods/stream-composition/Transform.js";

describe("createTransform", () => {
	it("should re-export NodeTransform", () => {
		expect(Transform).toBe(NodeTransform);
	});

	it("should transform chunks using the provided transform function", async () => {
		const transformStream = createTransform<string>(
			(chunk, encoding, callback) => {
				callback(null, chunk.toString().toUpperCase());
			},
		);

		const output: string[] = [];
		transformStream.on("data", (chunk) => output.push(chunk.toString()));

		transformStream.write("hello ");
		transformStream.write("world");
		transformStream.end();

		await new Promise((resolve) => transformStream.on("end", resolve));
		expect(output.join("")).toBe("HELLO WORLD");
	});

	it("should catch synchronous exceptions in transformFn and pass them to callback", async () => {
		const transformStream = createTransform<string>(() => {
			throw new Error("Synchronous transform failure");
		});

		const errorPromise = new Promise<Error>((resolve) => {
			transformStream.on("error", (err) => resolve(err));
		});

		transformStream.write("test");
		const err = await errorPromise;

		expect(err.message).toBe("Synchronous transform failure");
	});

	it("should wrap non-Error throws into Error instances", async () => {
		const transformStream = createTransform<string>(() => {
			throw "String error thrown";
		});

		const errorPromise = new Promise<Error>((resolve) => {
			transformStream.on("error", (err) => resolve(err));
		});

		transformStream.write("test");
		const err = await errorPromise;

		expect(err).toBeInstanceOf(Error);
		expect(err.message).toBe("String error thrown");
	});
});
