import { readAudio } from '@/lib/audio-store';
import { AUDIO_CONTENT_TYPE } from '@/lib/elevenlabs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves the mp3 bytes `/api/assets` stashed under this id (see
 * lib/audio-store). The app gets a plain http URL it can hand straight to
 * `expo-audio` — which is the one thing iOS AVPlayer reliably plays, unlike the
 * base64 `data:` URI this replaces.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bytes = readAudio(id);
  if (!bytes) return new Response('unknown audio id', { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': AUDIO_CONTENT_TYPE,
      'Content-Length': String(bytes.byteLength),
      // Every id is minted once for one immutable clip, so the phone may cache
      // hard; the store's own eviction is what bounds how long it lives.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
