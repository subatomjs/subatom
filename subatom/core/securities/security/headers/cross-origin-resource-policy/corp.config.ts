export type CORPValue = 'same-site' | 'same-origin' | 'cross-origin';

export interface CORPConfig {
  policy?: CORPValue;
}

export const defaultCORPConfig: CORPConfig = {
  policy: 'same-origin',
};