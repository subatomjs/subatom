// /subatom_framework/subatom/package/core/bootstrap/subatom-server/services/portProber.service.ts
import net from "node:net";

export function getAvailablePort(
	port: number,
	host: string,
	retries = 15,
): Promise<number> {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();

		probe.once("error", async (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				if (retries > 0) {
					await new Promise((r) => setTimeout(r, 100));
					resolve(getAvailablePort(port, host, retries - 1));
				} else {
					resolve(getAvailablePort(port + 1, host, 0));
				}
			} else {
				reject(err);
			}
		});

		probe.once("listening", () => {
			probe.close(() => resolve(port));
		});

		probe.listen(port, host);
	});
}
