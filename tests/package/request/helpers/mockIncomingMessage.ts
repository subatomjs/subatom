/// <reference types="node" />

// tests/helpers/mockIncomingMessage.ts
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { Readable } from "node:stream";

export interface MockIncomingMessageOptions {
	method?: string;
	url?: string;
	headers?: Record<string, string | string[] | undefined>;
	remoteAddress?: string;
	encrypted?: boolean;
	bodyChunks?: (Buffer | string | Uint8Array)[];
	emitErrorOnStream?: Error;
}

export function createMockIncomingMessage(
	options: MockIncomingMessageOptions = {},
): IncomingMessage {
	const {
		method = "GET",
		url = "/",
		headers = {},
		remoteAddress = "127.0.0.1",
		encrypted = false,
		bodyChunks = [],
		emitErrorOnStream,
	} = options;

	let chunkIndex = 0;

	const stream = new Readable({
		read() {
			if (emitErrorOnStream) {
				process.nextTick(() => this.destroy(emitErrorOnStream));
				return;
			}

			if (chunkIndex < bodyChunks.length) {
				const chunk = bodyChunks[chunkIndex++];
				this.push(
					typeof chunk === "string" ? Buffer.from(chunk, "utf-8") : chunk,
				);
			} else {
				this.push(null);
			}
		},
	}) as unknown as IncomingMessage;

	const socket = new EventEmitter() as Socket & { encrypted?: boolean };

	Object.defineProperty(socket, "remoteAddress", {
		value: remoteAddress,
		writable: true,
		configurable: true,
	});

	socket.encrypted = encrypted;

	stream.method = method;
	stream.url = url;
	stream.headers = headers;
	stream.socket = socket;

	return stream;
}
