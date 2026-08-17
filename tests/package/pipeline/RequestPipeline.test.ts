import { describe, it, expect, vi } from "vitest";
import { RequestPipeline } from "../../../package/core/pipeline/modifier/RequestPipeline.js";
import type { IRequestPipelineConfig } from "../../../package/core/pipeline/modifier/RequestPipeline.js";

describe("RequestPipeline execution lifecycle", () => {
  it("executes complete lifecycle: beforeRequest -> controller -> afterRequest -> beforeResponse -> serializer -> afterResponse", async () => {
    const executionOrder: string[] = [];

    const config: IRequestPipelineConfig = {
      transformers: [
        {
          beforeRequest: (req) => {
            executionOrder.push("beforeRequest");
            return { mutated: true };
          },
          afterRequest: (data) => {
            executionOrder.push("afterRequest");
            return { ...(data as any), afterReq: true };
          },
          beforeResponse: (envelope) => {
            executionOrder.push("beforeResponse");
            return { envelope, enveloped: true };
          },
          afterResponse: (serialized) => {
            executionOrder.push("afterResponse");
            return serialized;
          },
        },
      ],
      interceptors: [],
      serializers: [
        {
          serialize: (data) => {
            executionOrder.push("serialize");
            return JSON.stringify(data);
          },
        },
      ],
    };

    const req: any = { headers: {} };
    const res: any = { get: () => "application/json" };
    const pipeline = new RequestPipeline(config);

    const result = await pipeline.execute({
      req,
      res,
      routePath: "/users",
      method: "POST",
      runControllerChain: async () => {
        executionOrder.push("controller");
        return { user: "john" };
      },
    });

    expect(executionOrder).toEqual([
      "beforeRequest",
      "controller",
      "afterRequest",
      "beforeResponse",
      "serialize",
      "afterResponse",
    ]);

    expect(req.mutated).toBe(true);
    expect(result).toBe(
      JSON.stringify({
        envelope: { user: "john", afterReq: true },
        enveloped: true,
      }),
    );
  });
});