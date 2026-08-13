import fs from "node:fs";
import path from "node:path";

const cliPath = path.resolve("dist/package/cli-engine/cli.js");

if (fs.existsSync(cliPath)) {
    const content = fs.readFileSync(cliPath, "utf8");
    const shebang = "#!/usr/bin/env node\n";

    // Prepend shebang if not present
    if (!content.startsWith("#!")) {
        fs.writeFileSync(cliPath, shebang + content, "utf8");
    }

    // Grant executable permissions (chmod +x)
    try {
        fs.chmodSync(cliPath, 0o755);
        console.log("✔ CLI binary patched with shebang and executable permissions.");
    } catch (err) {
        console.warn("⚠ Could not apply chmod permissions:", (err as Error).message);
    }
} else {
    console.error(`❌ Postbuild failed: Binary not found at ${cliPath}`);
    process.exit(1);
}