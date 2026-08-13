import { CORPConfig, defaultCORPConfig } from "./corp.config.js";
import { normalizeConfig } from "../../utils/normalizeConfig.js";
import { setHeader } from "../../utils/setHeader.js";
import { SECURITY_HEADERS } from "../../security.constants.js";

export function createCORPMiddleware(options?: Partial<CORPConfig> | boolean) {
  const config = normalizeConfig(defaultCORPConfig, options);
  if (!config) return (_req: any, _res: any, next: () => void) => next();

  return (_req: any, res: any, next: () => void) => {
    setHeader(res, SECURITY_HEADERS.CORP, config.policy || "same-origin");
    next();
  };
}
