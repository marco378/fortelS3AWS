import path from "node:path";

export function sanitizePrefix(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed
    .replace(/\\/g, "/")
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .replace(/^\.+/, "")
    .replace(/\/\.+/g, "/");
  const collapsed = normalized
    .split("/")
    .filter(Boolean)
    .join("/");
  return collapsed || "job";
}

export function resolveSafeZipEntryPath(entryPath: string): string | null {
  const replaced = entryPath.replace(/\\/g, "/").trim();
  if (!replaced) {
    return null;
  }

  if (replaced.includes(":")) {
    return null;
  }

  const normalized = path.posix.normalize(replaced);
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized === ".." ||
    path.posix.isAbsolute(normalized)
  ) {
    return null;
  }

  const cleaned = normalized.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  if (!cleaned || cleaned === "." || cleaned.startsWith("../")) {
    return null;
  }
  return cleaned;
}

export function joinS3Key(prefix: string, relativePath: string): string {
  const cleanPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${cleanPrefix}${relativePath}`.replace(/\/+/g, "/");
}

export function extensionFromKey(key: string): string {
  const last = key.split("/").pop() ?? key;
  const parts = last.split(".");
  if (parts.length < 2) {
    return "";
  }
  return `.${parts.pop()!.toLowerCase()}`;
}

export function contentTypeFromKey(key: string): string {
  switch (extensionFromKey(key)) {
    case ".pdf":
      return "application/pdf";
    case ".zip":
      return "application/zip";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".csv":
      return "text/csv; charset=utf-8";
    case ".json":
      return "application/json";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".dwg":
      return "application/acad";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}
