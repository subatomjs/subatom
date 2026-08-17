import { describe, it, expect } from "vitest";
import {
  runInterceptors,
  InterceptorError,
} from "../../../package/core/pipeline/modifier/services/interceptorRunner.service.js";
import type { IInterceptor, IPipelineContext } from "../../../package/types/framework/pipeline/IPipeline.js";

describe("runInterceptors (Koa/Onion Model)", () => {
  const dummyCtx: IPipelineContext = {
    req: {} as any,
    res: {} as any,
    state: {},
  };

  it("executes in correct onion order and returns controller result", async () => {
    const traces: string[] = [];

    const i1: IInterceptor = {
      name: "I1",
      intercept: async (ctx, next) => {
        traces.push("i1-in");
        const res = await next();
        traces.push("i1-out");
        return res;
      },
    };

    const i2: IInterceptor = {
      name: "I2",
      intercept: async (ctx, next) => {
        traces.push("i2-in");
        const res = await next();
        traces.push("i2-out");
        return res;
      },
    };

    const result = await runInterceptors([i1, i2], dummyCtx, async () => {
      traces.push("controller");
      return "CONTROLLER_OUTPUT";
    });

    expect(result).toBe("CONTROLLER_OUTPUT");
    expect(traces).toEqual(["i1-in", "i2-in", "controller", "i2-out", "i1-out"]);
  });

  it("throws InterceptorError when next() is called multiple times", async () => {
    const badInterceptor: IInterceptor = {
      name: "DoubleNext",
      intercept: async (ctx, next) => {
        await next();
        return await next(); // Illegal second call
      },
    };

    await expect(
      runInterceptors([badInterceptor], dummyCtx, async () => "ok"),
    ).rejects.toThrow(InterceptorError);
  });

  it("wraps arbitrary thrown errors in InterceptorError", async () => {
    const explodingInterceptor: IInterceptor = {
      name: "Exploder",
      intercept: async () => {
        throw new Error("Boom");
      },
    };

    await expect(
      runInterceptors([explodingInterceptor], dummyCtx, async () => "ok"),
    ).rejects.toThrow(InterceptorError);
  });
});