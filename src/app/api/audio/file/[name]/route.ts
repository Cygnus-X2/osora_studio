import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { resolveInBucket, type AudioBucket } from "@/lib/paths";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

const BUCKETS: AudioBucket[] = ["generated", "processed", "exports", "uploads"];

/**
 * Serves a stored file back for audition.
 *
 * `resolveInBucket` rejects anything that resolves outside its bucket, so a
 * traversal attempt fails on where the path lands rather than on how it looked
 * going in. Range requests are supported so a browser can seek in a long
 * session without pulling the whole file.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  const extension = path.extname(decoded).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });
  }

  let resolved: string | null = null;
  let size = 0;
  for (const bucket of BUCKETS) {
    const candidate = resolveInBucket(bucket, decoded);
    if (!candidate) continue;
    try {
      size = (await stat(candidate)).size;
      resolved = candidate;
      break;
    } catch {
      // Not in this bucket; keep looking.
    }
  }

  if (!resolved) {
    return NextResponse.json(
      { error: "That file is no longer available. Generate it again." },
      { status: 404 },
    );
  }

  const range = request.headers.get("range");
  const match = range?.match(/bytes=(\d*)-(\d*)/);
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : size - 1;
    if (start >= size || end >= size || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      });
    }
    const stream = Readable.toWeb(
      createReadStream(resolved, { start, end }),
    ) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      status: 206,
      headers: {
        "content-type": contentType,
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "cache-control": "no-store",
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(resolved)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      "content-type": contentType,
      "content-length": String(size),
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    },
  });
}
