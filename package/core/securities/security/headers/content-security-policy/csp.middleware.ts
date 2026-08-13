import { CSPConfig, defaultCSPConfig } from "./csp.config.js";
import { serializeCSP } from "./csp.serializer.js";
import { normalizeConfig } from "../../utils/normalizeConfig.js";
import { setHeader } from "../../utils/setHeader.js";
import { SECURITY_HEADERS } from "../../security.constants.js";

export function createCSPMiddleware(options?: Partial<CSPConfig> | boolean) {
  const config = normalizeConfig(defaultCSPConfig, options);
  if (!config) return (_req: any, _res: any, next: () => void) => next();

  const serialized = serializeCSP(config.directives || {});
  const headerName = config.reportOnly
    ? SECURITY_HEADERS.CSP_REPORT_ONLY
    : SECURITY_HEADERS.CSP;

  return (_req: any, res: any, next: () => void) => {
    if (serialized) {
      setHeader(res, headerName, serialized);
    }
    next();
  };
}
