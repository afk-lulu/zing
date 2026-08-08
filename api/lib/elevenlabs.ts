import { StageError, requireEnv } from './http';
import { isMock, mockAudioBytes } from './mock';

/**
 * ElevenLabs `eleven_flash_v2_5` — one clip per slide, one fixed teacher voice
 * for the whole demo so the batch sounds like a single person (ARCH §2.S4).
 * Returns raw mp3 bytes; the caller decides where they land (Blob or data-URI).
 */
const MODEL_ID = 'eleven_flash_v2_5';
const OUTPUT_FORMAT = 'mp3_44100_128';

/** "Rachel" — overridable so a different teacher voice needs no code change. */
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export const AUDIO_CONTENT_TYPE = 'audio/mpeg';

export async function synthesizeNarration(text: string, signal?: AbortSignal): Promise<Buffer> {
  if (isMock()) return mockAudioBytes();

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

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
