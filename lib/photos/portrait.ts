import sharp from "sharp";

import { MAX_PORTRAIT_BYTES, PORTRAIT_MIN_WIDTH, PORTRAIT_MIN_HEIGHT, PORTRAIT_WIDTH, PORTRAIT_HEIGHT } from "./policy";
export { MAX_PORTRAIT_BYTES, PORTRAIT_RIGHTS_VERSION } from "./policy";

/** Largest 4:5 box that fits inside the source without enlarging it, capped at the stored maximum. */
export function portraitTarget(width: number, height: number): { width: number; height: number } {
  const ratio = PORTRAIT_WIDTH / PORTRAIT_HEIGHT;
  const targetWidth = Math.min(PORTRAIT_WIDTH, width, Math.floor(height * ratio));
  return { width: targetWidth, height: Math.round(targetWidth / ratio) };
}

export async function normalizeUploadedPortrait(bytes: Buffer): Promise<Buffer> {
  if (!bytes.length || bytes.length > MAX_PORTRAIT_BYTES) throw new Error("Choose a photo of 4 MB or less.");
  const source = sharp(bytes, { limitInputPixels: 20_000_000, animated: false, failOn: "error" });
  const metadata = await source.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
    throw new Error("Use a still JPEG, PNG or WebP photo.");
  }
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (width < PORTRAIT_MIN_WIDTH || height < PORTRAIT_MIN_HEIGHT) throw new Error(`Use a photo at least ${PORTRAIT_MIN_WIDTH} pixels wide and ${PORTRAIT_MIN_HEIGHT} pixels tall.`);
  const target = portraitTarget(width, height);
  // Re-encoding strips EXIF/location metadata and excludes active image formats.
  return source.rotate().resize(target.width, target.height, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
