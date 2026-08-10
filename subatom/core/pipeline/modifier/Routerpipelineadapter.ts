import type { IHandler } from "../../../types/framework/router/IRouter.js";
import type { IPipelineContext } from "../../../types/framework/pipeline/IPipeline.js";
import type { IRequest } from "../../../types/http/IRequest.js";
import type { IResponse } from "../../../types/http/IResponse.js";
import { normalizeError } from "../../http/errors/Error.js";
import { ErrorFormatter } from "../../http/errors/errorFormatter.js";
import type { Router } from "../../router/Router.js";
import { RequestPipeline, runInterceptors } from "./RequestPipeline.js";
import type { IRequestPipelineConfig } from "./RequestPipeline.js";
import { mergePipelineConfigs } from "./services/pipelineMerger.service.js";
import {
  createResponseCapture,
  flushCapturedResponse,
} from "./services/responseCapture.service.js";

export interface IRouterPipelineOptions {
  globalMiddlewares?: IHandler[];
  terminalMethods?: string[];
}

function extractCleanPath(req: IRequest): string {
  if ((req as any).path && typeof (req as any).path === "string") {
    return (req as any).path;
  }
  const rawUrl = req.url ?? "/";
  try {
    const dummyBase = "http://localhost";
    const parsed = new URL(rawUrl, dummyBase);
    return parsed.pathname || "/";
  } catch {
    return rawUrl.split("?")[0] || "/";
  }
}

export async function handleRequestWithPipeline(
  router: Router,
  req: IRequest,
  res: IResponse,
  appPipelineConfig: IRequestPipelineConfig,
  options: IRouterPipelineOptions = {},
): Promise<void> {
  const cleanPath = extractCleanPath(req);
  const method = req.method || "GET";

  const matchResult = router.match(method, req.url || cleanPath);
  const effectivePipelineConfig = mergePipelineConfigs(
    appPipelineConfig,
    matchResult?.route.routerPipeline,
  );

  const pipeline = new RequestPipeline(effectivePipelineConfig);

  // const {
  //     res: capturedRes,
  //     captured,
  //     rejectCaptured,
  //   } = createResponseCapture(res, options.terminalMethods);

  //   // Track whether `captured` has actually resolved, without awaiting it here —
  //   // we just need to know "did something call res.json()/send() etc first?"
  //   let hasCaptured = false;
  //   captured.then(() => { hasCaptured = true; }).catch(() => {});

  //   try {
  //     let capturedMethod = "json";

  //     const result = await pipeline.execute({
  //       req,
  //       res: capturedRes,
  //       routePath: cleanPath,
  //       method: req.method,
  //       runControllerChain: async (ctx: IPipelineContext) => {
  //         return runInterceptors(
  //           effectivePipelineConfig.interceptors,
  //           ctx,
  //           async () => {
  //             const dispatchPromise = router
  //               .dispatch(req, capturedRes, options.globalMiddlewares)
  //               .catch((err) => {
  //                 // Only log this when a response was genuinely captured
  //                 // already and this dispatch failure is now happening in
  //                 // the background after Promise.race abandoned it.
  //                 // Ordinary dispatch errors (404s, etc.) fall through
  //                 // silently here and get handled once, correctly, by the
  //                 // outer catch below.
  //                 if (hasCaptured) {
  //                   console.error(
  //                     "[Subatom Error]: Handler chain rejected after response was already captured.",
  //                     err,
  //                   );
  //                 }
  //                 throw err;
  //               });

  const {
    res: capturedRes,
    captured,
    rejectCaptured,
  } = createResponseCapture(res, options.terminalMethods);

  // Track whether `captured` has actually resolved, without awaiting it here —
  // we just need to know "did something call res.json()/send() etc first?"
  let hasCaptured = false;
  captured
    .then(() => {
      hasCaptured = true;
    })
    .catch(() => {});

  try {
    let capturedMethod = "json";

    const result = await pipeline.execute({
      req,
      res: capturedRes,
      routePath: cleanPath,
      method: req.method,
      runControllerChain: async (ctx: IPipelineContext) => {
        return runInterceptors(
          effectivePipelineConfig.interceptors,
          ctx,
          async () => {
            const dispatchPromise = router
              .dispatch(req, capturedRes, options.globalMiddlewares)
              .catch((err) => {
                // Only log this when a response was genuinely captured
                // already and this dispatch failure is now happening in
                // the background after Promise.race abandoned it.
                // Ordinary dispatch errors (404s, etc.) fall through
                // silently here and get handled once, correctly, by the
                // outer catch below.
                if (hasCaptured) {
                  console.error(
                    "[Subatom Error]: Handler chain rejected after response was already captured.",
                    err,
                  );
                }
                throw err;
              });

            const outcome = await Promise.race([
              captured.then((cap) => ({ type: "captured" as const, cap })),
              dispatchPromise.then((val) => ({
                type: "returned" as const,
                val,
              })),
            ]);

            if (outcome.type === "captured") {
              capturedMethod = outcome.cap.method;
              return outcome.cap.args[0];
            }

            return outcome.val;
          },
        );
      },
    });

    if (!res.writableEnded) {
      flushCapturedResponse(res, capturedMethod, [result]);
    }
  } catch (err: unknown) {
    rejectCaptured(err);

    if (res.writableEnded) {
      console.error(
        "[Subatom Error]: Unhandled error occurred after response was already sent.",
        err,
      );
      return;
    }
    ErrorFormatter.handle(normalizeError(err), req, res);
  }
}
