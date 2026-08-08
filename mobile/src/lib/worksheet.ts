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

/** Anthropic accepts ≤100pp / 32MB natively, but a big PDF still has to upload. */
const MAX_PDF_BYTES = 12 * 1024 * 1024;

export class WorksheetError extends Error {}

export async function captureFromCamera(): Promise<WorksheetSource | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new WorksheetError('Zing needs camera access to read the worksheet.');
  }

  const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
  return result.canceled ? null : prepareImage(result.assets[0].uri);
}

export async function pickFromLibrary(): Promise<WorksheetSource | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });
  return result.canceled ? null : prepareImage(result.assets[0].uri);
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
    throw new WorksheetError('That PDF is too big to send. Try a photo of one page instead.');
  }

  return { kind: 'pdf', data: await file.base64() };
}

async function prepareImage(uri: string): Promise<WorksheetSource> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: MAX_IMAGE_EDGE });

  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.7,
    base64: true,
  });

  if (!saved.base64) {
    throw new WorksheetError('Could not read that photo. Try taking it again.');
  }
  return { kind: 'image', mediaType: 'image/jpeg', data: saved.base64 };
}
