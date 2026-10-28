/**
 * BR-NSFW — upload content-moderation hook ("check NSFW content on upload;
 * sensitive content → error.file.sensitive_content").
 * Oia keeps it pluggable — OIA_NSFW=off (default; self-hosters decide) | stub.
 */
export type NsfwDecision = { allowed: true } | { allowed: false; error: "error.file.sensitive_content" };

export async function checkNsfw(_bytes: Uint8Array, _fileName: string): Promise<NsfwDecision> {
  const mode = process.env.OIA_NSFW ?? "off";
  if (mode === "off") return { allowed: true };
  if (mode === "stub") {
  // example: an abnormal count of zero bytes counts as "noise" (demo hook only, not real moderation)
    return { allowed: true };
  }
  // insertion point for a real moderation provider (AWS Rekognition / Hive …)
  return { allowed: true };
}
