import type { Artwork } from '../domain/release.ts';

/**
 * Reads an uploaded image into an Artwork. The image is kept as a data URL so a
 * Release stays one self-contained value — which is what lets it be autosaved
 * and exported into a project file later without a second store for binaries.
 */
export async function readArtwork(file: File): Promise<Artwork> {
  const dataUrl = await readAsDataUrl(file);
  const image = new Image();
  image.src = dataUrl;
  try {
    await image.decode();
  } catch {
    throw new Error('the browser could not decode this image');
  }
  return { dataUrl, widthPx: image.naturalWidth, heightPx: image.naturalHeight };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('the file could not be read'));
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('the file could not be read as an image'));
    reader.readAsDataURL(file);
  });
}
