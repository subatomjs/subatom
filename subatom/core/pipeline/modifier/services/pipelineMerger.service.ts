import type { IRequestPipelineConfig } from "../RequestPipeline.js";
import { sortedByPriority } from "../../../../types/framework/pipeline/IPipeline.js";

export function mergePipelineConfigs(
  appConfig: IRequestPipelineConfig,
  routerConfig?: IRequestPipelineConfig,
): IRequestPipelineConfig {
  if (!routerConfig) return appConfig;

  return {
    transformers: sortedByPriority([
      ...appConfig.transformers,
      ...routerConfig.transformers,
    ]),
    interceptors: sortedByPriority([
      ...appConfig.interceptors,
      ...routerConfig.interceptors,
    ]),
    serializers: sortedByPriority([
      ...appConfig.serializers,
      ...routerConfig.serializers,
    ]),
  };
}