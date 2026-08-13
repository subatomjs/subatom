export type COEPValue = 'unsafe-none' | 'require-corp' | 'credentialless';

export interface COEPConfig {
  policy?: COEPValue;
}

export const defaultCOEPConfig: COEPConfig = {
  policy: 'require-corp',
};