export type FrameguardAction = 'DENY' | 'SAMEORIGIN';

export interface FrameguardConfig {
  action?: FrameguardAction;
}

export const defaultFrameguardConfig: FrameguardConfig = {
  action: 'SAMEORIGIN',
};