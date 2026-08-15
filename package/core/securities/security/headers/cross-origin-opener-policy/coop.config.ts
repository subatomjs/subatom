export type COOPValue =
	| "unsafe-none"
	| "same-origin-allow-popups"
	| "same-origin";

export interface COOPConfig {
	policy?: COOPValue;
}

export const defaultCOOPConfig: COOPConfig = {
	policy: "same-origin",
};
