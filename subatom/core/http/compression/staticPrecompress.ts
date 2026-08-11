import { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { SubatomCompression, CompressionAlgorithm } from './compression.js';

export interface StaticPrecompressOptions {
  /** Absolute path to the root directory hosting static files */
  publicDir: string;
  /** Custom mapping of algorithms to file extensions. Default: .br, .gz, .zst, .deflate */
  extensionMap?: Partial<Record<CompressionAlgorithm, string>>;
  /** Enable fallback to dynamic real-time compression if pre-compressed asset isn't found. Default: true */
  fallbackToDynamic?: boolean;
}

const DEFAULT_EXT_MAP: Record<string, string> = {
  br: '.br',
  gzip: '.gz',
  zstd: '.zst',
  deflate: '.deflate',
};

/**
 * Serves pre-compressed static files directly from disk based on Accept-Encoding.
 */
export class SubatomStaticPrecompress {
  private publicDir: string;
  private extMap: Record<string, string>;
  private fallbackToDynamic: boolean;
  private compressionEngine: SubatomCompression;

  constructor(options: StaticPrecompressOptions) {
    this.publicDir = path.resolve(options.publicDir);
    this.extMap = { ...DEFAULT_EXT_MAP, ...options.extensionMap };
    this.fallbackToDynamic = options.fallbackToDynamic ?? true;
    this.compressionEngine = new SubatomCompression();
  }

  /**
   * Evaluates the request path and Accept-Encoding header to find a matching pre-compressed file on disk.
   */
  public resolvePrecompressedFile(
    req: IncomingMessage,
    requestPath: string
  ): { targetPath: string; encoding: CompressionAlgorithm | null } {
    const rawAcceptEncoding = req.headers['accept-encoding'] as string | undefined;
    const { algorithm } = this.compressionEngine.negotiate(rawAcceptEncoding);

    if (algorithm === 'identity') {
      return { targetPath: requestPath, encoding: null };
    }

    const extension = this.extMap[algorithm];
    if (extension) {
      const precompressedPath = `${requestPath}${extension}`;
      if (fs.existsSync(precompressedPath)) {
        return { targetPath: precompressedPath, encoding: algorithm };
      }
    }

    // Secondary fallback check: if client supports 'br' or 'gzip' but negotiation selected another,
    // look for available static files in order of efficiency.
    const priorityFallbacks: CompressionAlgorithm[] = ['br', 'gzip', 'deflate'];
    for (const fallbackAlgo of priorityFallbacks) {
      if (fallbackAlgo === algorithm) continue; // Already checked above
      const ext = this.extMap[fallbackAlgo];
      if (ext) {
        const fallbackPath = `${requestPath}${ext}`;
        if (fs.existsSync(fallbackPath)) {
          return { targetPath: fallbackPath, encoding: fallbackAlgo };
        }
      }
    }

    return { targetPath: requestPath, encoding: null };
  }

  /**
   * Middleware handler for Subatom's static router
   */
  public middleware() {
    return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      // Ignore non-GET/HEAD HTTP methods
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
      }

      // Safe path resolution to prevent directory traversal attacks
      const safeRelativePath = path.normalize(req.url || '/').replace(/^(\.\.[\/\\])+/, '');
      const absoluteFilePath = path.join(this.publicDir, safeRelativePath);

      // Verify base file existence
      if (!fs.existsSync(absoluteFilePath) || fs.statSync(absoluteFilePath).isDirectory()) {
        return next();
      }

      // Always set Vary header for HTTP caching correctness
      const existingVary = res.getHeader('Vary');
      if (!existingVary) {
        res.setHeader('Vary', 'Accept-Encoding');
      } else if (typeof existingVary === 'string' && !existingVary.includes('Accept-Encoding')) {
        res.setHeader('Vary', `${existingVary}, Accept-Encoding`);
      }

      // Attempt static pre-compressed file discovery
      const { targetPath, encoding } = this.resolvePrecompressedFile(req, absoluteFilePath);

      if (encoding) {
        // Pre-compressed file found! Stream straight from disk.
        res.setHeader('Content-Encoding', encoding);
        
        // Derive original Content-Type from original file name (not .br or .gz)
        const mimeType = this.getMimeType(absoluteFilePath);
        if (mimeType) res.setHeader('Content-Type', mimeType);

        const stat = fs.statSync(targetPath);
        res.setHeader('Content-Length', stat.size);

        if (req.method === 'HEAD') {
          res.statusCode = 200;
          return res.end();
        }

        const readStream = fs.createReadStream(targetPath);
        readStream.pipe(res);
        return;
      }

      // If no pre-compressed asset exists and dynamic fallback is enabled, pass down to dynamic middleware
      next();
    };
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.wasm': 'application/wasm',
    };
    return map[ext] || 'application/octet-stream';
  }
}

export function serveStaticPrecompressed(options: StaticPrecompressOptions) {
  const handler = new SubatomStaticPrecompress(options);
  return handler.middleware();
}