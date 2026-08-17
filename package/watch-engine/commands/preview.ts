import { existsSync } from "node:fs";
import path from "node:path";
import { findAndLoadConfig } from "../../config/load.config.js";
import { logger } from "../utils/logger.js";
import { resolvePort } from "../utils/port.js";
import { runProcess } from "../utils/spawnProcess.js";

export async function runPreview(): Promise<void> {
    const cwd = process.cwd();
    const config = await findAndLoadConfig(cwd);

    const outDir = path.resolve(cwd, config.outDir);
    const entryBase = path.basename(config.entry).replace(/\.tsx?$/, ".js");
    const compiledEntry = path.join(outDir, entryBase);

    if (!existsSync(compiledEntry)) {
        logger.error(`No build found at ${path.relative(cwd, compiledEntry)}`);
        logger.info(`Run "subatom build" before previewing.`);
        process.exit(1);
    }

    const port = await resolvePort(config.port, config.host);

    logger.info(`Previewing production build`);
    logger.success(`http://localhost:${port}`);

    runProcess(process.execPath, [compiledEntry], {
        cwd,
        label: "preview server",
        env: {
            NODE_ENV: "production",
            PORT: String(port),
            HOST: config.host,
        },
    });
}