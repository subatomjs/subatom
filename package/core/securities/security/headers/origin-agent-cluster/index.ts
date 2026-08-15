import { SECURITY_HEADERS } from "../../security.constants.js";
import { setHeader } from "../../utils/setHeader.js";

export function createOriginAgentClusterMiddleware(enabled: boolean = true) {
	return (_req: any, res: any, next: () => void) => {
		if (enabled) {
			setHeader(res, SECURITY_HEADERS.ORIGIN_AGENT_CLUSTER, "?1");
		}
		next();
	};
}
