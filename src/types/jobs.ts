export interface ProcessJobData {
  jobId: string;
  downloadUrl: string;
  projectName: string;
  callbackUrl?: string;
  callbackToken?: string;
}

export interface UploadedFileRecord {
  key: string;
  relativePath: string;
  size: number;
  contentType: string;
}

export interface ExtractionResult {
  fileCount: number;
  files: UploadedFileRecord[];
}

export interface CompletedJobResult {
  jobId: string;
  status: "completed";
  bucket: string;
  prefix: string;
  fileCount: number;
  files: string[];
}

export interface FailedJobResult {
  jobId: string;
  status: "failed";
  error: string;
}

export type ProcessJobResult = CompletedJobResult | FailedJobResult;

export interface ManifestFileRecord {
  key: string;
  size: number;
  contentType: string;
}

export interface ManifestDocument {
  jobId: string;
  createdAt: string;
  zipName: string;
  fileCount: number;
  files: ManifestFileRecord[];
}
