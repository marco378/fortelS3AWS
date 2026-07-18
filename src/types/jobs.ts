export interface ProcessJobData {
  jobId: string;
  projectName: string;
  sharepointUrl: string;
  callbackUrl: string;
}

export interface ProcessJobResult {
  jobId: string;
  status: "completed";
  bucket: string;
  prefix: string;
  fileCount: number;
}

