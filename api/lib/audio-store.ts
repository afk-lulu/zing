import { randomUUID } from 'node:crypto';

/**
 * Where ElevenLabs mp3 bytes live when there is no Blob token: a plain
 * module-level Map, handed back out by `GET /api/audio/[id]`.
 *
 * This is correct for the POC and deliberately nothing more. `next dev` is a
 * single long-lived process, so the Map `/api/assets` writes is the same Map
 * `/api/audio` reads. On Vercel it is not — each invocation may land in a fresh
 * container, so a clip stored during `/api/assets` can be gone by the time the
 * phone asks for it. That is exactly why BLOB_READ_WRITE_TOKEN remains the
 * preferred path whenever it is set (ARCH §2.S4).
 *
 * Bounded so a long dev session cannot grow without limit.
 */
const MAX_CLIPS = 64;
const MAX_BYTES = 32 * 1024 * 1024;

const clips = new Map<string, Buffer>();
let retainedBytes = 0;

/** Stores one clip and returns the id to serve it under. */
export function storeAudio(bytes: Buffer, name: string): string {
  const id = `${name}-${randomUUID().slice(0, 8)}`;
  clips.set(id, bytes);
  retainedBytes += bytes.byteLength;

  // A Map iterates in insertion order, so the first key is always the oldest.
  while (clips.size > MAX_CLIPS || retainedBytes > MAX_BYTES) {
    const oldest = clips.keys().next();
    if (oldest.done) break;
    retainedBytes -= clips.get(oldest.value)?.byteLength ?? 0;
    clips.delete(oldest.value);
  }

  return id;
}

export function readAudio(id: string): Buffer | undefined {
  return clips.get(id);
}
