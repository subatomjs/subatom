import path from "node:path";

export class EventFilter {
    private readonly extensions: Set<string>;
    private readonly ignoredPatterns: readonly string[];

    constructor(extensions: readonly string[], ignoredPatterns: readonly string[]) {
        this.extensions = new Set(
            extensions.map((ext) =>
                ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`,
            ),
        );
        this.ignoredPatterns = ignoredPatterns;
    }

    public isExtensionAllowed(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return this.extensions.has(ext);
    }

    public isPathIgnored(filePath: string): boolean {
        const normalized = filePath.replace(/\\/g, "/");
        for (const pattern of this.ignoredPatterns) {
            const cleanPattern = pattern.replace(/^\*\*\//, "").replace(/\/\*\*$/, "");
            if (normalized.includes(cleanPattern)) {
                return true;
            }
        }
        return false;
    }

    public shouldProcess(filePath: string): boolean {
        return !this.isPathIgnored(filePath) && this.isExtensionAllowed(filePath);
    }
}