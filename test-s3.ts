import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function test() {
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_INCOMING_BUCKET!,
      Key: "test/hello.txt",
      Body: "Hello from Fortel Worker!",
    })
  );

  console.log("✅ Upload successful!");
}

test().catch(console.error);
