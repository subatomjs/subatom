import { setHeader } from '../../utils/setHeader.js';
import { SECURITY_HEADERS } from '../../security.constants.js';

export function createDownloadOptionsMiddleware(enabled: boolean = true) {
  return (_req: any, res: any, next: () => void) => {
    if (enabled) {
      setHeader(res, SECURITY_HEADERS.X_DOWNLOAD_OPTIONS, 'noopen');
    }
    next();
  };
}