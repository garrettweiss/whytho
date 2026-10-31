import sharp from "sharp";

import { MAX_PORTRAIT_BYTES, PORTRAIT_WIDTH, PORTRAIT_HEIGHT } from "./policy";
export { MAX_PORTRAIT_BYTES, PORTRAIT_RIGHTS_VERSION } from "./policy";

export async function normalizeUploadedPortrait(bytes: Buffer): Promise<Buffer> {
  if (!bytes.length || bytes.length > MAX_PORTRAIT_BYTES) throw new Error("Choose a photo of 4 MB or less.");
  const source = sharp(bytes, { limitInputPixels: 20_000_000, animated: false, failOn: "error" });
  const metadata = await source.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
    throw new Error("Use a still JPEG, PNG or WebP photo.");
  }
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (width < PORTRAIT_WIDTH || height < PORTRAIT_HEIGHT) throw new Error("Use a photo at least 400 pixels wide and 500 pixels tall.");
  // Re-encoding strips EXIF/location metadata and excludes active image formats.
  return source.rotate().resize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
