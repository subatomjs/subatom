import { PermissionsPolicyConfig, defaultPermissionsPolicyConfig } from './permissions-policy.config.js';
import { serializePermissionsPolicy } from './permissions-policy.serializer.js';
import { normalizeConfig } from '../../utils/normalizeConfig.js';
import { setHeader } from '../../utils/setHeader.js';
import { SECURITY_HEADERS } from '../../security.constants.js';

export function createPermissionsPolicyMiddleware(options?: Partial<PermissionsPolicyConfig> | boolean) {
  const config = normalizeConfig(defaultPermissionsPolicyConfig, options);
  if (!config) return (_req: any, _res: any, next: () => void) => next();

  const serialized = serializePermissionsPolicy(config.features || {});

  return (_req: any, res: any, next: () => void) => {
    if (serialized) {
      setHeader(res, SECURITY_HEADERS.PERMISSIONS_POLICY, serialized);
    }
    next();
  };
}