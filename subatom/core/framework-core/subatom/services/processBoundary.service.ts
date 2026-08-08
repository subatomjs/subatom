import { env } from "../../../../engine/utils/env/env.js";
import type { SubatomServer } from "../../subatom-server/SubatomServer.js";

export function registerProcessBoundary(
	getServerInstance: () => SubatomServer | undefined,
	shutdownAction: (code: number) => void,
): void {
	process.on("unhandledRejection", (reason: any) => {
		const server = getServerInstance();
		const recovered = server?.tryRecoverFromOrphanedRejection(reason);

		if (recovered) {
			return;
		}

		console.error(
			"\n🔥 [Subatom Process Error] Unhandled Promise Rejection Detected:",
		);
		console.error(reason?.stack || reason);
	});

	process.on("uncaughtException", (error: Error) => {
		console.error("\n💥 [Subatom Fatal Error] Uncaught Synchronous Exception:");
		console.error(error.stack || error.message);

		if (env.isProd) {
			console.error("Initiating emergency graceful shutdown...");
			shutdownAction(1);
		}
	});

	process.on("SIGINT", () => shutdownAction(0));
	process.on("SIGTERM", () => shutdownAction(0));
}
