// Leave room for multipart headers below the hosting request-body limit.
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
export const MEDIA_TYPES: Record<string, "image" | "video" | "audio"> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image", "image/heic": "image", "image/gif": "image",
  "video/mp4": "video", "video/quicktime": "video", "video/webm": "video",
  "audio/mpeg": "audio", "audio/wav": "audio", "audio/mp4": "audio", "audio/ogg": "audio", "audio/x-m4a": "audio",
};
