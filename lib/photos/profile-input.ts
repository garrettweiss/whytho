import { z } from "zod";

const webUrl = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}, "Use a valid HTTPS website URL.");
const handle = z.string().trim().max(100).regex(/^@?[a-zA-Z0-9._-]*$/, "Enter a handle, not a URL.");
export const profileInput = z.object({
  politician_id: z.string().uuid(),
  website_url: webUrl.optional(),
  bio: z.string().trim().max(1000).optional(),
  social_handles: z.object({ x: handle.optional(), twitter: handle.optional(), instagram: handle.optional(), tiktok: handle.optional(),
    facebook: z.string().trim().max(300).refine(value => !value || /^@?[\w.-]+$/.test(value) || /^https:\/\/(www\.)?facebook\.com\/[\w./?=&%-]+$/.test(value), "Enter a Facebook page name or https://facebook.com link.").optional(),
  }).strict().optional(),
}).strict();
