# Fortel ZIP Worker

Production-ready Node.js 22 + TypeScript worker for streaming ZIP processing, built for n8n-triggered automation.

## Flow

1. n8n resolves the SharePoint link and obtains the Microsoft Graph `downloadUrl`.
2. n8n `POST`s job metadata to this worker.
3. The worker streams the ZIP directly from `downloadUrl` into `fortel-incoming`.
4. The ZIP is streamed back from S3 and extracted entry-by-entry into `fortel-extracted`.
5. The worker uploads each extracted file back into SharePoint using Microsoft Graph.
6. A manifest is written to `fortel-extracted/{jobId}/manifest.json`.
7. The worker posts a completion or failure callback to n8n.

## Stack

- Node.js 22
- TypeScript
- Express
- AWS SDK v3
- BullMQ
- Redis
- Microsoft Graph
- unzipper
- Axios
- Pino
- dotenv

## Environment

Required variables:

```bash
PORT=3000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_INCOMING_BUCKET=fortel-incoming
S3_EXTRACTED_BUCKET=fortel-extracted
GRAPH_CLIENT_ID=...
GRAPH_CLIENT_SECRET=...
GRAPH_TENANT_ID=...
GRAPH_DRIVE_ID=...
GRAPH_TARGET_FOLDER=Fortel-Extracted
REDIS_URL=redis://localhost:6379
N8N_CALLBACK_SECRET=...
```

## API

### `POST /process`

Request:

```json
{
  "jobId": "123",
  "projectName": "ABC",
  "downloadUrl": "https://...@microsoft.graph.downloadUrl...",
  "callbackUrl": "https://n8n/webhook/job-complete",
  "callbackToken": "optional"
}
```

Response:

```json
{
  "status": "queued",
  "jobId": "123"
}
```

### `GET /health`

Returns:

```json
{
  "status": "ok",
  "service": "fortel-zip-worker",
  "uptimeSeconds": 123
}
```

## Sample `curl`

Queue a job:

```bash
curl -X POST http://localhost:3000/process \
  -H "Content-Type: application/json" \
  -d '{
    "jobId":"123",
    "projectName":"ABC",
    "downloadUrl":"https://...@microsoft.graph.downloadUrl...",
    "callbackUrl":"https://example.n8n.cloud/webhook/job-complete"
  }'
```

Health check:

```bash
curl http://localhost:3000/health
```

## Callback payload

The worker sends this JSON when extraction completes:

```json
{
  "jobId": "123",
  "status": "completed",
  "bucket": "fortel-extracted",
  "prefix": "123/",
  "fileCount": 87,
  "files": [
    "Drawings/GA.pdf",
    "Plans/Basement/slab.pdf"
  ]
}
```

If processing fails, the callback payload is:

```json
{
  "jobId": "123",
  "status": "failed",
  "error": "Unable to download ZIP"
}
```

The manifest is saved to `fortel-extracted/{jobId}/manifest.json` and includes:

```json
{
  "jobId": "123",
  "createdAt": "2026-07-18T08:30:00Z",
  "zipName": "Saint Gobain.zip",
  "fileCount": 74,
  "files": [
    {
      "key": "123/Drawings/GA.pdf",
      "size": 245871,
      "contentType": "application/pdf"
    }
  ]
}
```

## Deploy on Railway

1. Set the environment variables above in Railway.
2. Make sure Redis is available and `REDIS_URL` points at it.
3. Deploy with the included `Dockerfile` and `railway.json`.

The service listens on `PORT` and exposes `/health` for readiness checks.

## Notes

- ZIPs are processed without loading the full archive into memory.
- No extracted files are written to local disk.
- S3 uploads use multipart upload and server-side encryption.
- SharePoint uploads use Microsoft Graph and are streamed in chunks.
- File paths inside ZIPs are sanitized to prevent path traversal.
