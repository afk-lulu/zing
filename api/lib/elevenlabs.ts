import { StageError, requireEnv } from './http';
import { isMock, mockAudioBytes } from './mock';

/**
 * ElevenLabs `eleven_flash_v2_5` — one clip per slide. ARCH §2.S4 wants a batch
 * to sound like a single person, so the teacher is drawn *once per batch* from
 * a small pool and every slide in that batch reuses it: two runs of the demo
 * get different teachers, one run never switches mid-lesson.
 * Returns raw mp3 bytes; the caller decides where they land (Blob or data-URI).
 */
const MODEL_ID = 'eleven_flash_v2_5';
const OUTPUT_FORMAT = 'mp3_44100_128';

/**
 * Stock pool — "Rachel" and "Adam". Override with ELEVENLABS_VOICE_IDS (a
 * comma-separated list) so swapping or adding teachers needs no code change.
 */
const DEFAULT_VOICE_IDS = ['21m00Tcm4TlvDq8ikWAM', 'pNInz6obpgDQGcFmaJgB'];

export const AUDIO_CONTENT_TYPE = 'audio/mpeg';

/**
 * The configured pool, in order, never empty. `ELEVENLABS_VOICE_ID` (singular)
 * still works and simply pins the pool to one voice.
 */
export function voicePool(): string[] {
  const configured = (process.env.ELEVENLABS_VOICE_IDS || process.env.ELEVENLABS_VOICE_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  return configured.length > 0 ? configured : DEFAULT_VOICE_IDS;
}

/**
 * Draw the narrator for one batch. Call this once per request and thread the
 * result through every slide — calling it per slide would change teacher
 * between slides, which is exactly what ARCH §2.S4 rules out.
 */
export function pickVoiceId(): string {
  const pool = voicePool();
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function synthesizeNarration(
  text: string,
  voiceId: string,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (isMock()) return mockAudioBytes();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': requireEnv('ELEVENLABS_API_KEY'),
        'Content-Type': 'application/json',
        Accept: AUDIO_CONTENT_TYPE,
      },
      body: JSON.stringify({ text, model_id: MODEL_ID }),
      signal,
    },
  );

  if (!response.ok) {
    let detail = '(no body)';
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {
      // keep the placeholder
    }
    throw new StageError(`elevenlabs returned ${response.status}: ${detail}`, 502, 'assets');
  }

  return Buffer.from(await response.arrayBuffer());
}
