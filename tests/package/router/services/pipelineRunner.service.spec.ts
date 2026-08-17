import { describe, it, expect, vi } from "vitest";
import { runPipeline } from "../../../../package/core/router/services/pipelineRunner.service.js";
import type { IRequest } from "../../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../../package/types/http/IResponse.js";
import type { IHandler } from "../../../../package/types/framework/router/IRouter.js";
import type { NextFunction } from "../../../../package/types/framework/pipeline/INext.js";

describe("Unit: pipelineRunner.service", () => {
    interface MockResponse {
        writableEnded: boolean;
    }

    const createReqRes = () => {
        const req = {} as IRequest;
        const res = { writableEnded: false } as unknown as IResponse & MockResponse;
        return { req, res };
    };

    it("should execute handlers sequentially", async () => {
        const { req, res } = createReqRes();
        const executionOrder: number[] = [];

        const h1: IHandler = async (_req, _res, next) => {
            executionOrder.push(1);
            await next();
            executionOrder.push(4);
        };
        const h2: IHandler = async (_req, _res, next) => {
            executionOrder.push(2);
            await next();
            executionOrder.push(3);
        };

        await runPipeline([h1, h2], req, res);
        expect(executionOrder).toEqual([1, 2, 3, 4]);
    });

    it("should stop execution immediately when res.writableEnded becomes true", async () => {
        const { req, res } = createReqRes();
        const h2 = vi.fn();

        const h1: IHandler = (_req, response, next) => {
            (response as unknown as MockResponse).writableEnded = true;
            return next();
        };

        await runPipeline([h1, h2], req, res);
        expect(h2).not.toHaveBeenCalled();
    });

    it("should propagate thrown errors and mark pipeline as settled", async () => {
        const { req, res } = createReqRes();
        const customError = new Error("Pipeline Failure");

        const h1: IHandler = () => {
            throw customError;
        };

        await expect(runPipeline([h1], req, res)).rejects.toThrow("Pipeline Failure");
    });

    it("should warn if next() is called after pipeline is settled", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { req, res } = createReqRes();

        let leakyNext!: NextFunction;
        const h1: IHandler = async (_req, _res, next) => {
            leakyNext = next;
            await next();
        };

        await runPipeline([h1], req, res);
        await leakyNext();

        expect(warnSpy).toHaveBeenCalledWith(
            "[Subatom Warning]: next() was called after the request pipeline already settled; ignoring."
        );
        warnSpy.mockRestore();
    });
});