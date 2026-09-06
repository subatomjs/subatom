import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPipeline } from "../../../../../packages/core/router/services/pipelineRunner.service.js";
import type { IRequest } from "../../../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../../../packages/core/http/response/types/response.types.js";
import type { IHandler } from "../../../../../packages/core/router/types/router.types.js";
import type { NextFunction } from "../../../../../packages/pipelines/next/types/nextFunction.types.js";

interface MutableMockResponse {
  writableEnded: boolean;
  end: () => void;
}

function createMockResponse(): { res: IResponse; state: MutableMockResponse } {
  const state: MutableMockResponse = {
    writableEnded: false,
    end() {
      state.writableEnded = true;
    },
  };

  const res = {} as IResponse;
  Object.defineProperty(res, "writableEnded", {
    get: () => state.writableEnded,
    configurable: true,
  });
  Object.defineProperty(res, "end", {
    value: state.end,
    configurable: true,
  });

  return { res, state };
}

describe("runPipeline", () => {
  let req: IRequest;
  let res: IResponse;
  let resState: MutableMockResponse;

  beforeEach(() => {
    req = {} as IRequest;
    const fixture = createMockResponse();
    res = fixture.res;
    resState = fixture.state;
  });

  it("should execute handlers sequentially via next()", async () => {
    const calls: number[] = [];
    const handlers: IHandler[] = [
      async (_req: IRequest, _res: IResponse, next: NextFunction) => {
        calls.push(1);
        await next();
      },
      async (_req: IRequest, _res: IResponse, next: NextFunction) => {
        calls.push(2);
        await next();
      },
      async () => {
        calls.push(3);
      },
    ];

    await runPipeline(handlers, req, res);
    expect(calls).toEqual([1, 2, 3]);
  });

  it("should halt execution if res.writableEnded is true", async () => {
    const calls: number[] = [];
    const handlers: IHandler[] = [
      async (_req: IRequest, response: IResponse, next: NextFunction) => {
        calls.push(1);
        resState.writableEnded = true;
        await next();
      },
      async () => {
        calls.push(2);
      },
    ];

    await runPipeline(handlers, req, res);
    expect(calls).toEqual([1]);
  });

  it("should rethrow errors passed into next(err)", async () => {
    const error = new Error("Pipeline Stop");
    const handlers: IHandler[] = [
      async (_req: IRequest, _res: IResponse, next: NextFunction) => {
        await next(error);
      },
    ];

    await expect(runPipeline(handlers, req, res)).rejects.toThrow("Pipeline Stop");
  });
it("should skip undefined or falsy handlers in the handlers array", async () => {
    const executed: number[] = [];
    const handlers = [
      undefined as unknown as IHandler,
      async (_req: IRequest, _res: IResponse, next: NextFunction) => {
        executed.push(1);
        await next();
      },
    ];

    await runPipeline(handlers, req, res);
    expect(executed).toEqual([1]);
  });
  it("should catch synchronous exceptions in handlers and reject", async () => {
    const handlers: IHandler[] = [
      () => {
        throw new Error("Crash in handler");
      },
    ];

    await expect(runPipeline(handlers, req, res)).rejects.toThrow("Crash in handler");
  });

  it("should ignore redundant next() calls after settlement with a warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let capturedNext!: NextFunction;

    const handlers: IHandler[] = [
      async (_req: IRequest, _res: IResponse, next: NextFunction) => {
        capturedNext = next;
        await next();
      },
    ];

    await runPipeline(handlers, req, res);
    await capturedNext();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("next() was called after the request pipeline already settled"),
    );
    warnSpy.mockRestore();
  });
});