import { IncomingMessage, ServerResponse } from "node:http";
import { UploadFile } from "../../modules/file_upload/UploadFile.js";

export type StorageStrategy = "memory" | "disk";

export interface FileParserConfig {
  storage: StorageStrategy;
  dest?: string;
  allowedMimeTypes?: string[];
  limits?: {
    fileSize?: number;
    files?: number;
    fields?: number;
    fieldSize?: number;
    parts?: number;
  };
}

export interface FileMiddlewareOptions extends FileParserConfig {
  fieldname?: string;
  
}

export type FilesMap = Record<string, UploadFile[]>;
export type RequestFiles = UploadFile[] | FilesMap;

export interface FrameworkRequest extends IncomingMessage {
  body?: Record<string, unknown>;
  file?: UploadFile | undefined;
  files?: RequestFiles;
}

export type NextFunction = (err?: unknown) => void;

export type Middleware = (
  req: FrameworkRequest,
  res: ServerResponse,
  next: NextFunction
) => Promise<void> | void;