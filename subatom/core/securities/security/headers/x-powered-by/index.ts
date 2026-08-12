import { removeHeader, setHeader } from '../../utils/setHeader.js';
import { SECURITY_HEADERS } from '../../security.constants.js';

export function createXPoweredByMiddleware(value: boolean | string = false) {
  return (_req: any, res: any, next: () => void) => {
    if (value === false) {
      removeHeader(res, SECURITY_HEADERS.X_POWERED_BY);
    } else if (typeof value === 'string') {
      setHeader(res, SECURITY_HEADERS.X_POWERED_BY, value);
    }
    next();
  };
}