import { describe, it, expect } from "vitest";
import {
  runTransformerHook,
  TransformerError,
} from "../../../package/core/pipeline/modifier/services/transformerRunner.service.js";
import type {
  ITransformer,
  IPipelineContext,
} from "../../../package/types/framework/pipeline/IPipeline.js";

describe("runTransformerHook", () => {
  const dummyCtx: IPipelineContext = {
    req: {} as any,
    res: {} as any,
    routePath: "/api",
    method: "POST",
    state: {},
  };

  it("runs transformers in sequence and pipes transformed values", async () => {
    const t1: ITransformer = {
      name: "T1",
      afterRequest: (val: any) => ({ ...val, step1: true }),
    };
    const t2: ITransformer = {
      name: "T2",
      afterRequest: (val: any) => ({ ...val, step2: true }),
    };

    const result = await runTransformerHook(
      [t1, t2],
      "afterRequest",
      { init: true },
      dummyCtx,
    );
    expect(result).toEqual({ init: true, step1: true, step2: true });
  });

  it("preserves previous value if a hook returns undefined", async () => {
    const t1: ITransformer = {
      beforeResponse: () => undefined,
    };

    const result = await runTransformerHook(
      [t1],
      "beforeResponse",
      { keep: "me" },
      dummyCtx,
    );
    expect(result).toEqual({ keep: "me" });
  });

  it("wraps any thrown exception in TransformerError with metadata", async () => {
    const tFail: ITransformer = {
      name: "BadTransformer",
      beforeRequest: () => {
        throw new Error("Crash inside hook");
      },
    };

    await expect(
      runTransformerHook([tFail], "beforeRequest", {}, dummyCtx),
    ).rejects.toThrow(TransformerError);

    try {
      await runTransformerHook([tFail], "beforeRequest", {}, dummyCtx);
    } catch (err: any) {
      expect(err).toBeInstanceOf(TransformerError);
      expect(err.hook).toBe("beforeRequest");
      expect(err.transformerName).toBe("BadTransformer");
      expect(err.message).toContain("Crash inside hook");
    }
  });
});
