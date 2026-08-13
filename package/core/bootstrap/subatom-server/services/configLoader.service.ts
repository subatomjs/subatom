// subatom/package/core/bootstrap/subatom-server/services/configLoader.service.ts
import type { ISubatomServerConfig } from "../../../../types/framework/core/IFrameworkCore.js";

export async function findAndLoadConfig(): Promise<ISubatomServerConfig> {
	try {
		const configModule = await import(
			/* webpackIgnore: true */ `${process.cwd()}/subatom.config.js`
		);
		return configModule.default || configModule.config || {};
	} catch {
		return {};
	}
}
