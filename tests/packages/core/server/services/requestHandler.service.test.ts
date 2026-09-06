import { describe, expect, it, vi, beforeEach } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { IRouter } from "../../../../../packages/core/router/types/router.types.js";
import type { IRequestPipelineConfig } from "../../../../../packages/pipelines/modifiers/types/modifiers.types.js";
import type { IRequestContext } from "../../../../../packages/core/server/types/subatom.server.types.js";
import { handleRequestWithPipeline } from "../../../../../packages/pipelines/modifiers/handleRequestWithPipeline.js";
import { handleErrorPipeline } from "../../../../../packages/core/server/services/errorPipeline.service.js";
import {
	processHttpRequest,
	type ITrackedIncomingMessage,
} from "../../../../../packages/core/server/services/requestHandler.service.js";

vi.mock("../../../../../packages/pipelines/modifiers/handleRequestWithPipeline.js", () => ({
	handleRequestWithPipeline: vi.fn(),
}));

vi.mock("../../../../../packages/core/server/services/errorPipeline.service.js", () => ({
	handleErrorPipeline: vi.fn(),
}));

function createMockIncomingMessage(): IncomingMessage & ITrackedIncomingMessage {
	const emitter = new EventEmitter() as IncomingMessage & ITrackedIncomingMessage;
	emitter.headers = {};
	emitter.method = "GET";
	emitter.url = "/";
	emitter.socket = {
		remoteAddress: "127.0.0.1",
	} as unknown as Socket;
	return emitter;
}

function createMockServerResponse(): ServerResponse {
	const emitter = new EventEmitter() as ServerResponse;
	emitter.statusCode = 200;
	emitter.setHeader = vi.fn();
	emitter.getHeader = vi.fn();
	emitter.writeHead = vi.fn();
	emitter.end = vi.fn();
	return emitter;
}

describe("requestHandler.service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should attach id and startTime to native_request and execute pipeline within context", async () => {
		const rawReq = createMockIncomingMessage();
		const rawRes = createMockServerResponse();
		const router = {} as IRouter;
		const pipelineConfig: IRequestPipelineConfig = {
			transformers: [],
			interceptors: [],
			serializers: [],
		};
		const requestContext = new AsyncLocalStorage<IRequestContext>();

		vi.mocked(handleRequestWithPipeline).mockImplementation(async () => {
			const currentStore = requestContext.getStore();
			expect(currentStore).toBeDefined();
			expect(currentStore?.req).toBeDefined();
			expect(currentStore?.res).toBeDefined();
		});

		await processHttpRequest(
			rawReq,
			rawRes,
			router,
			[],
			[],
			requestContext,
			pipelineConfig,
		);

		expect(rawReq.id).toBeDefined();
		expect(typeof rawReq.id).toBe("string");
		expect(rawReq.startTime).toBeDefined();
		expect(typeof rawReq.startTime).toBe("number");
		expect(handleRequestWithPipeline).toHaveBeenCalledTimes(1);
		expect(handleErrorPipeline).not.toHaveBeenCalled();
	});

	it("should route errors to handleErrorPipeline if handleRequestWithPipeline throws", async () => {
		const rawReq = createMockIncomingMessage();
		const rawRes = createMockServerResponse();
		const router = {} as IRouter;
		const requestContext = new AsyncLocalStorage<IRequestContext>();
		const failure = new Error("Pipeline blew up");

		vi.mocked(handleRequestWithPipeline).mockRejectedValue(failure);

		await processHttpRequest(
			rawReq,
			rawRes,
			router,
			[],
			[],
			requestContext,
			{ transformers: [], interceptors: [], serializers: [] },
		);

		expect(handleErrorPipeline).toHaveBeenCalledTimes(1);
		expect(handleErrorPipeline).toHaveBeenCalledWith(
			failure,
			expect.anything(),
			expect.anything(),
			[],
		);
	});
});