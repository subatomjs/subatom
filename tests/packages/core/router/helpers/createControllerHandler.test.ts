import { describe, it, expect, vi, beforeEach } from "vitest";
import createControllerHandler from "../../../../../packages/core/router/helpers/createControllerHandler.js";
import { getOrCreateContext } from "../../../../../packages/context/Context.js";
import type { IRequest } from "../../../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../../../packages/core/http/response/types/response.types.js";
import type { IContext, IController } from "../../../../../packages/core/router/types/router.types.js";

vi.mock("../../../../../packages/context/Context.js", () => ({
  getOrCreateContext: vi.fn(),
}));

interface MutableResponseState {
  writableEnded: boolean;
  headersSent: boolean;
}

function createMockResponseFixture(): {
  res: IResponse;
  state: MutableResponseState;
} {
  const state: MutableResponseState = {
    writableEnded: false,
    headersSent: false,
  };

  const res = {
    raw: {},
  } as unknown as IResponse;

  Object.defineProperty(res, "writableEnded", {
    get: () => state.writableEnded,
    configurable: true,
  });

  Object.defineProperty(res, "headersSent", {
    get: () => state.headersSent,
    configurable: true,
  });

  return { res, state };
}

describe("createControllerHandler", () => {
  let req: IRequest;
  let res: IResponse;
  let resState: MutableResponseState;
  let ctx: {
    req: IRequest;
    res: IResponse;
    json: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    req = { raw: {} } as unknown as IRequest;

    const fixture = createMockResponseFixture();
    res = fixture.res;
    resState = fixture.state;

    ctx = {
      req,
      res,
      json: vi.fn(),
      send: vi.fn(),
    };

    vi.mocked(getOrCreateContext).mockReturnValue(
      ctx as unknown as ReturnType<typeof getOrCreateContext>,
    );
  });

  it("should bypass execution if response has already ended or headers sent", async () => {
    resState.writableEnded = true;
    const controller = vi.fn() as unknown as IController;
    const handler = createControllerHandler(controller);

    await handler(req, res, next);
    expect(controller).not.toHaveBeenCalled();

    resState.writableEnded = false;
    resState.headersSent = true;
    await handler(req, res, next);
    expect(controller).not.toHaveBeenCalled();
  });

  it("should auto-serialize objects into json", async () => {
    const payload = { success: true };
    const controller: IController = () => payload;
    const handler = createControllerHandler(controller);

    await handler(req, res, next);
    expect(ctx.json).toHaveBeenCalledWith(payload);
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it("should auto-serialize primitive strings, numbers, and booleans", async () => {
    let controller: IController = () => "test-string";
    let handler = createControllerHandler(controller);
    await handler(req, res, next);
    expect(ctx.send).toHaveBeenCalledWith("test-string");

    controller = () => 123;
    handler = createControllerHandler(controller);
    await handler(req, res, next);
    expect(ctx.send).toHaveBeenCalledWith("123");

    controller = () => false;
    handler = createControllerHandler(controller);
    await handler(req, res, next);
    expect(ctx.send).toHaveBeenCalledWith("false");
  });

  it("should not auto-serialize Buffer or Uint8Array instances", async () => {
    const buffer = Buffer.from("hello");
    const controller: IController = () => buffer;
    const handler = createControllerHandler(controller);

    await handler(req, res, next);
    expect(ctx.json).not.toHaveBeenCalled();
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it("should not serialize when controller returns ctx or response instances", async () => {
    const controller: IController = () => ctx;
    const handler = createControllerHandler(controller);

    await handler(req, res, next);
    expect(ctx.json).not.toHaveBeenCalled();
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it("should forward thrown errors to next()", async () => {
    const error = new Error("Controller failure");
    const controller: IController = () => {
      throw error;
    };
    const handler = createControllerHandler(controller);

    await handler(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
