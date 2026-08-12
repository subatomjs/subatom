import { COOPConfig, defaultCOOPConfig } from './coop.config.js';
import { normalizeConfig } from '../../utils/normalizeConfig.js';
import { setHeader } from '../../utils/setHeader.js';
import { SECURITY_HEADERS } from '../../security.constants.js';

export function createCOOPMiddleware(options?: Partial<COOPConfig> | boolean) {
  const config = normalizeConfig(defaultCOOPConfig, options);
  if (!config) return (_req: any, _res: any, next: () => void) => next();

  return (_req: any, res: any, next: () => void) => {
    setHeader(res, SECURITY_HEADERS.COOP, config.policy || 'same-origin');
    next();
  };
}