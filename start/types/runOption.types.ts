export interface RunOptions {
	readonly cwd?: string | undefined;
	readonly env?: Readonly<Record<string, string | undefined>> | undefined;
	readonly label: string;
}
