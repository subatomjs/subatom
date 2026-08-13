export type ReferrerPolicyValue =
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

export interface ReferrerPolicyConfig {
  policy?: ReferrerPolicyValue | ReferrerPolicyValue[];
}

export const defaultReferrerPolicyConfig: ReferrerPolicyConfig = {
  policy: 'no-referrer',
};