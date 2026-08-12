import { setHeader } from '../../utils/setHeader.js';
import { SECURITY_HEADERS } from '../../security.constants.js';

export function createContentTypeOptionsMiddleware(enabled: boolean = true) {
  return (_req: any, res: any, next: () => void) => {
    if (enabled) {
      setHeader(res, SECURITY_HEADERS.X_CONTENT_TYPE_OPTIONS, 'nosniff');
    }
    next();
  };
}