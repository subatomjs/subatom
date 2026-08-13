import { setHeader } from '../../utils/setHeader.js';
import { SECURITY_HEADERS } from '../../security.constants.js';

export function createDNSPrefetchControlMiddleware(options?: { allow?: boolean } | boolean) {
  const allow = typeof options === 'boolean' ? options : options?.allow ?? false;

  return (_req: any, res: any, next: () => void) => {
    setHeader(res, SECURITY_HEADERS.X_DNS_PREFETCH_CONTROL, allow ? 'on' : 'off');
    next();
  };
}