import type {
  IPipelineContext,
  ITransformer,
} from "../../../../types/framework/pipeline/IPipeline.js";

type HookName =
  | "beforeRequest"
  | "afterRequest"
  | "beforeResponse"
  | "afterResponse";

export class TransformerError extends Error {
  public readonly hook: HookName;
  public readonly transformerName?: string | undefined;
  public override readonly cause?: unknown;

  constructor(
    hook: HookName,
    transformerName: string | undefined,
    cause: unknown,
  ) {
    const label = transformerName ? `"${transformerName}"` : "(anonymous)";
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(`[Subatom] Transformer ${label} threw during "${hook}": ${causeMsg}`);
    this.name = "TransformerError";
    this.hook = hook;
    this.transformerName = transformerName;
    this.cause = cause;
  }
}

export async function runTransformerHook(
  transformers: ITransformer[],
  hook: HookName,
  value: unknown,
  ctx: IPipelineContext,
): Promise<unknown> {
  let current = value;

  for (const transformer of transformers) {
    const fn = transformer[hook];
    if (typeof fn !== "function") continue;

    try {
      const result = await (
        fn as (a: unknown, b: IPipelineContext) => unknown
      )(current, ctx);
      current = result === undefined ? current : result;
    } catch (cause) {
      throw new TransformerError(hook, transformer.name, cause);
    }
  }

  return current;
}