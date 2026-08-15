import type {
	IncomingMessage,
	OutgoingHttpHeaders,
	ServerResponse,
} from "node:http";
import { type Transform, Writable } from "node:stream";
import type {
	CompressionOptions,
	CompressionState,
} from "../../../types/http/ICompression.js";
import type { SubatomCompression } from "./compressor.js";
import {
	addVaryAcceptEncoding,
	getChunkByteLength,
	isBodylessResponse,
} from "./utils.js";

export function createDynamicCompressionMiddleware(engine: SubatomCompression) {
	return (
		req: IncomingMessage,
		res: ServerResponse,
		next: (err?: unknown) => void,
	): void => {
		const originalWrite = res.write.bind(res);
		const originalEnd = res.end.bind(res);
		const originalWriteHead = res.writeHead.bind(res);
		const originalFlushHeaders = res.flushHeaders.bind(res);

		let state: CompressionState = "pending";
		let compressor: Transform | null = null;
		let responseSink: Writable | null = null;
		let rejectionPending = false;
		let closeHandler: (() => void) | null = null;

		const cleanup = (): void => {
			if (closeHandler) {
				res.removeListener("close", closeHandler);
				closeHandler = null;
			}
		};

		const createResponseSink = (): Writable => {
			return new Writable({
				write(chunk, _encoding, callback) {
					if (res.destroyed || res.writableEnded) {
						callback(new Error("HTTP response is no longer writable"));
						return;
					}

					let canContinue = false;

					try {
						canContinue = originalWrite(chunk);
					} catch (error) {
						callback(error instanceof Error ? error : new Error(String(error)));
						return;
					}

					if (canContinue) {
						callback();
						return;
					}

					res.once("drain", callback);
				},

				final(callback) {
					if (res.destroyed || res.writableEnded) {
						callback();
						return;
					}

					try {
						originalEnd();
						callback();
					} catch (error) {
						callback(error instanceof Error ? error : new Error(String(error)));
					}
				},

				destroy(error, callback) {
					if (error && !res.destroyed) {
						res.destroy(error);
					}

					callback(error ?? undefined);
				},
			});
		};

		const initialize = (
			statusCode?: number,
			knownLength?: number,
		): "compressing" | "identity" | "rejected" => {
			if (state === "compressing") {
				return "compressing";
			}

			if (state === "identity") {
				return "identity";
			}

			if (state === "rejected") {
				return "rejected";
			}

			if (statusCode !== undefined) {
				res.statusCode = statusCode;
			}

			if (res.headersSent) {
				state = "identity";
				return "identity";
			}

			if (isBodylessResponse(req, res)) {
				state = "identity";
				return "identity";
			}

			if (res.getHeader("content-encoding") !== undefined) {
				state = "identity";
				return "identity";
			}

			const acceptEncoding = req.headers["accept-encoding"];

			const negotiation = engine.negotiate(
				typeof acceptEncoding === "string" ? acceptEncoding : undefined,
			);

			if (!negotiation.acceptable) {
				state = "rejected";
				rejectionPending = true;

				addVaryAcceptEncoding(res);
				res.statusCode = 406;
				res.setHeader("Content-Type", "text/plain; charset=utf-8");
				res.removeHeader("Content-Length");

				return "rejected";
			}

			if (!engine.isCompressible(req, res, knownLength)) {
				state = "identity";
				return "identity";
			}

			addVaryAcceptEncoding(res);

			if (negotiation.algorithm === "identity") {
				state = "identity";
				return "identity";
			}

			const created = engine.createCompressorStream(negotiation.algorithm);

			if (!created) {
				state = "identity";
				return "identity";
			}

			compressor = created;

			res.removeHeader("Content-Length");
			res.setHeader("Content-Encoding", negotiation.algorithm);

			responseSink = createResponseSink();

			closeHandler = () => {
				if (compressor && !compressor.destroyed) {
					compressor.destroy();
				}

				if (responseSink && !responseSink.destroyed) {
					responseSink.destroy();
				}

				cleanup();
			};

			res.once("close", closeHandler);

			compressor.once("error", (error) => {
				cleanup();

				if (!res.destroyed) {
					res.destroy(error);
				}
			});

			responseSink.once("error", (error) => {
				cleanup();

				if (!res.destroyed) {
					res.destroy(error);
				}
			});

			compressor.pipe(responseSink);
			state = "compressing";

			return "compressing";
		};

		const copyHeaders = (headers: OutgoingHttpHeaders): void => {
			for (const [name, value] of Object.entries(headers)) {
				if (value === undefined) {
					continue;
				}

				res.setHeader(name, value);
			}
		};

		res.writeHead = function (
			this: ServerResponse,
			statusCode: number,
			statusMessageOrHeaders?: string | OutgoingHttpHeaders,
			headers?: OutgoingHttpHeaders,
		): ServerResponse {
			if (
				statusMessageOrHeaders &&
				typeof statusMessageOrHeaders !== "string"
			) {
				copyHeaders(statusMessageOrHeaders);
			}

			if (headers !== undefined) {
				copyHeaders(headers);
			}

			const result = initialize(statusCode);

			if (result === "rejected") {
				return originalWriteHead(statusCode);
			}

			if (typeof statusMessageOrHeaders === "string") {
				return originalWriteHead(statusCode, statusMessageOrHeaders);
			}

			return originalWriteHead(statusCode);
		} as ServerResponse["writeHead"];

		res.flushHeaders = function (this: ServerResponse): void {
			const result = initialize();

			if (result === "rejected") {
				originalFlushHeaders();
				return;
			}

			originalFlushHeaders();
		};

		res.write = function (
			this: ServerResponse,
			chunk: any,
			encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
			callback?: (error?: Error | null) => void,
		): boolean {
			const result = initialize();

			if (result === "rejected") {
				const error = new Error(
					"Response was rejected by Accept-Encoding negotiation",
				);

				if (typeof encodingOrCallback === "function") {
					encodingOrCallback(error);
				} else if (callback) {
					callback(error);
				}

				return false;
			}

			if (result === "compressing" && compressor) {
				if (typeof encodingOrCallback === "function") {
					return compressor.write(chunk, encodingOrCallback);
				}

				if (encodingOrCallback !== undefined) {
					return compressor.write(chunk, encodingOrCallback, callback);
				}

				if (callback) {
					return compressor.write(chunk, callback);
				}

				return compressor.write(chunk);
			}

			if (typeof encodingOrCallback === "function") {
				return originalWrite(chunk, encodingOrCallback);
			}

			if (encodingOrCallback !== undefined) {
				return originalWrite(chunk, encodingOrCallback, callback);
			}

			if (callback) {
				return originalWrite(chunk, callback);
			}

			return originalWrite(chunk);
		} as ServerResponse["write"];

		res.end = function (
			this: ServerResponse,
			chunk?: any,
			encodingOrCallback?: BufferEncoding | (() => void),
			callback?: () => void,
		): ServerResponse {
			let knownLength: number | undefined;

			if (chunk !== undefined && typeof chunk !== "function") {
				const encoding =
					typeof encodingOrCallback === "string"
						? encodingOrCallback
						: undefined;

				knownLength = getChunkByteLength(chunk, encoding);
			}

			const result = initialize(undefined, knownLength);

			if (result === "rejected") {
				rejectionPending = false;

				try {
					return originalEnd("Not Acceptable");
				} catch {
					if (!res.destroyed) {
						res.destroy();
					}

					return res;
				}
			}

			if (result === "compressing" && compressor) {
				if (chunk !== undefined && typeof chunk !== "function") {
					if (typeof encodingOrCallback === "string") {
						compressor.end(chunk, encodingOrCallback, callback);
						return res;
					}

					if (typeof encodingOrCallback === "function") {
						compressor.end(chunk, encodingOrCallback);
						return res;
					}

					if (callback) {
						compressor.end(chunk, callback);
						return res;
					}

					compressor.end(chunk);
					return res;
				}

				if (typeof chunk === "function") {
					compressor.end(chunk);
					return res;
				}

				if (typeof encodingOrCallback === "function") {
					compressor.end(encodingOrCallback);
					return res;
				}

				if (callback) {
					compressor.end(callback);
					return res;
				}

				compressor.end();
				return res;
			}

			if (chunk === undefined) {
				if (typeof encodingOrCallback === "function") {
					return originalEnd(encodingOrCallback);
				}

				if (callback) {
					return originalEnd(callback);
				}

				return originalEnd();
			}

			if (typeof chunk === "function") {
				return originalEnd(chunk);
			}

			if (typeof encodingOrCallback === "string") {
				return originalEnd(chunk, encodingOrCallback, callback);
			}

			if (typeof encodingOrCallback === "function") {
				return originalEnd(chunk, encodingOrCallback);
			}

			if (callback) {
				return originalEnd(chunk, callback);
			}

			return originalEnd(chunk);
		} as ServerResponse["end"];

		next();
	};
}
