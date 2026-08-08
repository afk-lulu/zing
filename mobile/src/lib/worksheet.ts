import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { WorksheetSource } from './api';

/**
 * Turning what the child pointed the phone at into the base64 payload S1 wants.
 *
 * Photos are resized before encoding. A raw 12MP phone photo base64-encodes to
 * roughly 8MB, which is over Vercel's request-body limit — and Claude's vision
 * path downsamples anything past ~1568px on the long edge anyway, so the extra
 * pixels buy nothing and cost the whole upload.
 */
const MAX_IMAGE_EDGE = 1568;

/**
 * Anthropic accepts ≤100pp / 32MB natively, but the PDF has to reach the
 * Vercel function first (PRD §2) and base64 inflates it by a third. The same
 * ~4.5MB request-body ceiling that governs photos governs this: 3MB of PDF
 * encodes to ~4MB, which fits; anything larger is rejected before it is read.
 */
const MAX_PDF_BYTES = 3 * 1024 * 1024;

export class WorksheetError extends Error {}

export async function captureFromCamera(): Promise<WorksheetSource | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new WorksheetError('Zing needs camera access to read the worksheet.');
  }

  const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
  return result.canceled ? null : prepareImage(result.assets[0]);
}

export async function pickFromLibrary(): Promise<WorksheetSource | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });
  return result.canceled ? null : prepareImage(result.assets[0]);
}

export async function pickPdf(): Promise<WorksheetSource | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const file = new File(asset.uri);
  if (file.size > MAX_PDF_BYTES) {
    throw new WorksheetError(
      'That PDF is too big to send. Take a photo of the page you want instead — one page is all Zing needs.',
    );
  }

  return { kind: 'pdf', data: await file.base64(), fingerprint: fingerprintOf(file, 'pdf') };
}

async function prepareImage(asset: ImagePicker.ImagePickerAsset): Promise<WorksheetSource> {
  const context = ImageManipulator.manipulate(asset.uri);

  // Cap the **long** edge, not the width: a parent photographs a page in
  // portrait, and capping 3024×4032 by width still leaves 1568×2090 for Claude
  // to downsample server-side — the same picture, ~1.8× the upload.
  const longEdge = Math.max(asset.width, asset.height);
  if (!longEdge) {
    // The picker reports 0 when the system withheld the dimensions; cap the
    // width so an unknown photo is still bounded.
    context.resize({ width: MAX_IMAGE_EDGE });
  } else if (longEdge > MAX_IMAGE_EDGE) {
    context.resize(
      asset.height > asset.width ? { height: MAX_IMAGE_EDGE } : { width: MAX_IMAGE_EDGE },
    );
  }

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });

  if (!saved.base64) {
    throw new WorksheetError('Could not read that photo. Try taking it again.');
  }
  return {
    kind: 'image',
    mediaType: 'image/jpeg',
    data: saved.base64,
    // `saved.uri` is the *rendered* JPEG — the same bytes `data` encodes, not
    // the camera original. Hashing the original would key the cache on
    // something we never send, and the resize/compress step would be free to
    // change the payload underneath a "hit".
    fingerprint: fingerprintOf(new File(saved.uri), 'image'),
  };
}

/**
 * The batch cache's key material (see `batchCache.ts`).
 *
 * `expo-file-system` is already a dependency and its `File` exposes a native
 * MD5, so there is no new package to add and no multi-megabyte hash loop on the
 * JS thread — the platform reads the file and returns a digest. MD5's weakness
 * is collision *forgery*, which needs an attacker; here the input is a photo
 * the parent just took, so it is only ever being asked to tell two worksheets
 * apart. The byte length rides along anyway.
 *
 * Returns `undefined` when the platform will not hash the file, which the cache
 * reads as "do not cache" — a normal pipeline run, silently.
 */
function fingerprintOf(file: File, kind: 'image' | 'pdf'): string | undefined {
  try {
    const md5 = file.md5;
    return md5 ? `${kind}-${md5}-${file.size}` : undefined;
  } catch {
    return undefined;
  }
}
