import { COEPConfig, defaultCOEPConfig } from './coep.config.js';
import { normalizeConfig } from '../../utils/normalizeConfig.js';
import { setHeader } from '../../utils/setHeader.js';
import { SECURITY_HEADERS } from '../../security.constants.js';

export function createCOEPMiddleware(options?: Partial<COEPConfig> | boolean) {
  const config = normalizeConfig(defaultCOEPConfig, options);
  if (!config) return (_req: any, _res: any, next: () => void) => next();

  return (_req: any, res: any, next: () => void) => {
    setHeader(res, SECURITY_HEADERS.COEP, config.policy || 'require-corp');
    next();
  };
}