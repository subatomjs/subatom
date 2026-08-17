import { describe, it, expect, vi } from "vitest";
import { Next } from "../../../package/core/pipeline/next-pipeline/Next.js";
import type { IHandler } from "../../../package/types/framework/router/IRouter.js";

describe("Next Pipeline Runner", () => {
  it("executes handlers sequentially in order", async () => {
    const executionOrder: number[] = [];

    const h1: IHandler = async (req, res, next) => {
      executionOrder.push(1);
      await next();
    };
    const h2: IHandler = async (req, res, next) => {
      executionOrder.push(2);
      await next();
    };
    const h3: IHandler = async (req, res, next) => {
      executionOrder.push(3);
    };

    const req: any = {};
    const res: any = { writableEnded: false };
    const pipeline = new Next([h1, h2, h3], req, res);

    await pipeline.run();
    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it("halts execution when res.writableEnded becomes true", async () => {
    const executionOrder: number[] = [];

    const h1: IHandler = async (req, res, next) => {
      executionOrder.push(1);
      // Cast to any to mutate readonly mock property in tests
      (res as any).writableEnded = true;
      await next();
    };
    const h2: IHandler = async (req, res, next) => {
      executionOrder.push(2);
    };

    const req: any = {};
    const res: any = { writableEnded: false };
    const pipeline = new Next([h1, h2], req, res);

    await pipeline.run();
    expect(executionOrder).toEqual([1]);
  });

  it("skips undefined/sparse handler entries seamlessly", async () => {
    const executionOrder: number[] = [];

    const h1: IHandler = async (req, res, next) => {
      executionOrder.push(1);
      await next();
    };
    const h2: IHandler = async (req, res, next) => {
      executionOrder.push(2);
    };

    const req: any = {};
    const res: any = { writableEnded: false };
    // Pass a sparse array with undefined entry to cover `if (!handler) return this.next()`
    const handlers: IHandler[] = [h1, undefined as unknown as IHandler, h2];
    const pipeline = new Next(handlers, req, res);

    await pipeline.run();
    expect(executionOrder).toEqual([1, 2]);
  });

  it("propagates synchronous errors thrown inside handlers", async () => {
    const h1: IHandler = () => {
      throw new Error("Sync failure");
    };

    const pipeline = new Next([h1], {} as any, { writableEnded: false } as any);
    await expect(pipeline.run()).rejects.toThrow("Sync failure");
  });

  it("propagates errors passed via next(err)", async () => {
    const h1: IHandler = async (req, res, next) => {
      await next(new Error("Passed error"));
    };

    const pipeline = new Next([h1], {} as any, { writableEnded: false } as any);
    await expect(pipeline.run()).rejects.toThrow("Passed error");
  });

  it("warns and ignores next() calls made after pipeline is settled", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    let storedNext!: any;
    const h1: IHandler = async (req, res, next) => {
      storedNext = next;
      // Advance to end of pipeline so settled is set to true
      await next();
    };

    const pipeline = new Next([h1], {} as any, { writableEnded: false } as any);
    await pipeline.run();

    // Call next again after the pipeline has already completed and settled
    await storedNext();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "next() was called after the request pipeline already settled",
      ),
    );

    warnSpy.mockRestore();
  });
});
