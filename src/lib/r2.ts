import "server-only";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Ảnh phiếu Kho IT (ảnh thiết bị + ảnh phiếu đã ký, 22/10/2026) lưu trên Cloudflare R2 — giống Kho công
// trình, KHÔNG dùng Firebase Storage (Sếp không nâng gói Blaze). Biến môi trường cùng tên các app khác:
// R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET_NAME. Mọi khoá nằm dưới thư mục
// "itasset/" → dùng chung bucket với app khác cũng không lẫn.
// Máy local chưa khai R2 (chỉ khi NODE_ENV=development) → lưu tạm vào thư mục tạm của máy để chạy thử.

const hasR2 = () =>
  !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
const devMode = () => !hasR2() && process.env.NODE_ENV === "development";
const devPath = (key: string) => path.join(os.tmpdir(), "itasset-r2-dev", ...key.split("/"));

let client: S3Client | null = null;
function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    });
  }
  return client;
}
const bucket = () => process.env.R2_BUCKET_NAME!;

/** Đã khai R2 (hoặc đang chạy thử local) — chưa thì không cho tải ảnh lên, báo rõ cho người dùng */
export function storageReady(): boolean {
  return hasR2() || devMode();
}

export async function putFile(key: string, body: Uint8Array, contentType: string): Promise<void> {
  if (devMode()) {
    await fs.mkdir(path.dirname(devPath(key)), { recursive: true });
    await fs.writeFile(devPath(key), body);
    return;
  }
  await r2().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

const TYPE_OF: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function getFile(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    if (devMode()) {
      const bytes = await fs.readFile(devPath(key));
      return { bytes: new Uint8Array(bytes), contentType: TYPE_OF[key.split(".").pop() || ""] || "application/octet-stream" };
    }
    const out = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    if (!out.Body) return null;
    return { bytes: await out.Body.transformToByteArray(), contentType: out.ContentType || "application/octet-stream" };
  } catch {
    return null;
  }
}

/** Xoá ảnh khi xoá phiếu — việc phụ: lỗi thì bỏ qua (ảnh mồ côi trên R2 không ảnh hưởng số liệu) */
export async function deleteFiles(keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    if (devMode()) {
      await Promise.all(keys.map((k) => fs.rm(devPath(k), { force: true })));
      return;
    }
    if (!hasR2()) return;
    for (let i = 0; i < keys.length; i += 900) {
      await r2().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.slice(i, i + 900).map((Key) => ({ Key })), Quiet: true } }));
    }
  } catch (e) {
    console.error("[r2] xoá ảnh lỗi:", e);
  }
}
