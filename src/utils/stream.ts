import { Readable, Transform } from "node:stream";

export async function bufferToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createByteCountingStream(onChunk: (size: number) => void): Transform {
  return new Transform({
    transform(chunk, _encoding, callback) {
      onChunk(Buffer.byteLength(chunk));
      callback(null, chunk);
    }
  });
}
