import { put } from '@vercel/blob';
import { storeAudio } from './audio-store';
import { AUDIO_CONTENT_TYPE } from './elevenlabs';

/**
 * ElevenLabs hands back bytes, but the app wants a plain URL it can pass
 * straight to `expo-audio`. Three paths, in order of preference:
 *
 * 1. Blob token set → upload and return the Blob URL. The only path that
 *    survives a serverless cold start, so it wins whenever it is available.
 * 2. No token, but we know the host the request arrived on → keep the bytes in
 *    process and point at `GET /api/audio/<id>`. The URL is built from the
 *    request's own `Host` header rather than `localhost`, so the phone on the
 *    LAN gets something it can actually reach.
 * 3. Neither → the base64 data-URI that ARCH §2.S4 calls the acceptable POC
 *    fallback. iOS AVPlayer does not reliably play those, so it is a last
 *    resort, not a default.
 */
export async function hostAudio(bytes: Buffer, name: string, host?: string): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`zing/audio/${name}.mp3`, bytes, {
      access: 'public',
      contentType: AUDIO_CONTENT_TYPE,
      addRandomSuffix: true,
    });
    return blob.url;
  }

  // Plain http: this path only exists for the local dev server, and anything
  // served over https has Blob configured.
  if (host) return `http://${host}/api/audio/${encodeURIComponent(storeAudio(bytes, name))}`;

  return `data:${AUDIO_CONTENT_TYPE};base64,${bytes.toString('base64')}`;
}
