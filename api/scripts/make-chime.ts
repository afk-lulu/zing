/**
 * Synthesises the correct-answer chime (ARCH §4 — "correct → mini confetti +
 * chime") straight to a WAV file. No encoder, no dependency, no download: the
 * asset is bundled into the app with a literal `require()`, so the chime works
 * offline exactly like the ARCH §5 fallback media.
 *
 *   npm run make:chime
 *
 * Two ascending sine notes (C6 then E6) with an exponential decay each and a
 * short master fade-out, which is what keeps it a chime rather than a beep.
 * Re-run it only if you want a different note pair — the committed
 * `mobile/src/assets/chime.wav` is the artefact, this is just how it was made.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Relative to `api/`, which is where the npm script runs. */
const OUT = '../mobile/src/assets/chime.wav';

const SAMPLE_RATE = 44_100;
const DURATION_S = 0.4;
/** Headroom: a chime that clips reads as a buzz on a phone speaker. */
const PEAK = 0.62;
const FADE_OUT_S = 0.025;
const ATTACK_S = 0.004;
/** Time constant of the exponential decay — roughly a struck-bell tail. */
const DECAY_TAU_S = 0.11;

const NOTES = [
  { freq: 1046.502, startS: 0 }, // C6
  { freq: 1318.51, startS: 0.13 }, // E6
];

function synthesise(): Float64Array {
  const frames = Math.round(SAMPLE_RATE * DURATION_S);
  const samples = new Float64Array(frames);

  for (const note of NOTES) {
    const startFrame = Math.round(note.startS * SAMPLE_RATE);
    for (let i = startFrame; i < frames; i++) {
      const t = (i - startFrame) / SAMPLE_RATE;
      // Ramp the onset in, or the discontinuity is an audible click.
      const attack = Math.min(1, t / ATTACK_S);
      const envelope = attack * Math.exp(-t / DECAY_TAU_S);
      samples[i] += Math.sin(2 * Math.PI * note.freq * t) * envelope;
    }
  }

  // Fade the tail to true zero so the file does not end on a step.
  const fadeFrames = Math.round(FADE_OUT_S * SAMPLE_RATE);
  for (let i = frames - fadeFrames; i < frames; i++) {
    samples[i] *= (frames - 1 - i) / fadeFrames;
  }

  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  if (max > 0) for (let i = 0; i < frames; i++) samples[i] *= PEAK / max;

  return samples;
}

/** Canonical 44-byte RIFF header + 16-bit PCM mono body. */
function toWav(samples: Float64Array): Buffer {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // format: PCM
  buffer.writeUInt16LE(1, 22); // channels: mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }

  return buffer;
}

async function main() {
  const path = resolve(process.cwd(), OUT);
  const wav = toWav(synthesise());
  await writeFile(path, wav);
  console.log(`wrote ${path} — ${DURATION_S * 1000}ms, ${SAMPLE_RATE}Hz, 16-bit mono, ${wav.length} bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
