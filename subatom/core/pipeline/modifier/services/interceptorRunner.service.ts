import type {
  IInterceptor,
  IPipelineContext,
} from "../../../../types/framework/pipeline/IPipeline.js";

export class InterceptorError extends Error {
  public readonly interceptorName?: string | undefined;
  public override readonly cause?: unknown;

  constructor(interceptorName: string | undefined, cause: unknown) {
    const label = interceptorName ? `"${interceptorName}"` : "(anonymous)";
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(`[Subatom] Interceptor ${label} threw: ${causeMsg}`);
    this.name = "InterceptorError";
    this.interceptorName = interceptorName;
    this.cause = cause;
  }
}

export async function runInterceptors(
  interceptors: IInterceptor[],
  ctx: IPipelineContext,
  invokeController: () => Promise<unknown>,
): Promise<unknown> {
  let lastIndex = -1;

  async function dispatch(i: number): Promise<unknown> {
    if (i <= lastIndex) {
      throw new InterceptorError(
        interceptors[i - 1]?.name,
        new Error(
          "[Subatom] next() was called more than once by the same interceptor.",
        ),
      );
    }
    lastIndex = i;

    if (i === interceptors.length) {
      return invokeController();
    }

    const interceptor = interceptors[i]!;

    try {
      return await interceptor.intercept(ctx, () => dispatch(i + 1));
    } catch (cause) {
      if (cause instanceof InterceptorError) throw cause;
      throw new InterceptorError(interceptor.name, cause);
    }
  }

  return dispatch(0);
}