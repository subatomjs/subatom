export interface SubatomConfig {
  /** Entry file relative to project root */
  entry: string;
  /** Output directory for builds */
  outDir: string;
  /** Default dev/start port (overridable via --port or PORT env) */
  port: number;
  /** Host to bind to */
  host: string;
  /** Emit sourcemaps on build */
  sourcemap: boolean;
  /** Minify production build */
  minify: boolean;
}

export type SubatomUserConfig = Partial<SubatomConfig>;