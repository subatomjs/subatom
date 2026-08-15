export function normalizeConfig<T extends object>(
	defaultConfig: T,
	userConfig?: Partial<T> | boolean,
): T | false {
	if (userConfig === false) return false;
	if (userConfig === true || userConfig === undefined)
		return { ...defaultConfig };
	return { ...defaultConfig, ...userConfig };
}
