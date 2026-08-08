import { put } from '@vercel/blob';
import { AUDIO_CONTENT_TYPE } from './elevenlabs';

/**
 * ElevenLabs hands back bytes, but the app wants a plain URL it can pass
 * straight to `expo-audio`. When a Blob token is configured we upload and
 * return the URL; without one we inline a base64 data-URI, which ARCH §2.S4
 * calls out as the acceptable POC fallback.
 */
export async function hostAudio(bytes: Buffer, name: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return `data:${AUDIO_CONTENT_TYPE};base64,${bytes.toString('base64')}`;
  }

  const blob = await put(`zing/audio/${name}.mp3`, bytes, {
    access: 'public',
    contentType: AUDIO_CONTENT_TYPE,
    addRandomSuffix: true,
  });
  return blob.url;
}
