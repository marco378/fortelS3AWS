# Fortel ZIP Worker

Production-ready Node.js 22 + TypeScript worker for streaming ZIP processing from SharePoint into S3, built for n8n-triggered automation.

## Flow

1. n8n receives a SharePoint share link.
2. n8n `POST`s job metadata to this worker.
3. The worker resolves the SharePoint share link with Microsoft Graph.
4. The ZIP is downloaded as a stream and uploaded to `fortel-incoming` with multipart upload.
5. The ZIP is streamed back from S3 and extracted entry-by-entry into `fortel-extracted`.
6. The worker posts a completion callback to n8n.

## Stack

- Node.js 22
- TypeScript
- Express
- AWS SDK v3
- Microsoft Graph API
- BullMQ
- Redis
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
REDIS_URL=redis://localhost:6379
```

## API

### `POST /process`

Request:

```json
{
  "jobId": "123",
  "projectName": "ABC",
  "sharepointUrl": "https://...",
  "callbackUrl": "https://n8n/webhook/job-complete"
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
    "sharepointUrl":"https://contoso.sharepoint.com/:u:/r/sites/.../shared%20document.zip",
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
  "prefix": "ABC/",
  "fileCount": 87
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
- File paths inside ZIPs are sanitized to prevent path traversal.
