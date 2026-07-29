// POST multipart/form-data: wallet (plain claimed address) + fields JSON + image file.
// Uploads image + metadata JSON to Pinata. NO wallet signature is required:
// the deployment transaction itself authenticates the creator (registration
// verifies receipt.from + calldata + manifest hash + predicted token). In
// place of the removed signed envelope this route keeps/strengthens pure
// server-side protections: same-origin check, strict MIME allowlist + size
// caps, per-IP rate limit, per-claimed-wallet rate limit, and content-hash
// deduplication (a duplicate upload returns the SAME CIDs without re-uploading).

import { isAddress, keccak256, stringToHex } from "viem";
import {
  uploadMetadataViaPinata,
  type MetadataInput,
  type MetadataUploadResult,
} from "@bps/launch-lab";
import { getFlags } from "../../../../lib/lab/server";
import {
  assertSameOrigin,
  clientKey,
  err,
  mapError,
  ok,
  rateLimited,
} from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

// ---- content-hash deduplication (per serverless instance) ----
// Keyed on keccak of the image bytes + the canonical metadata fields. Within
// the TTL an identical upload returns the SAME CIDs without touching Pinata.
const DEDUP_TTL_MS = 10 * 60_000;
const dedupCache = new Map<string, { at: number; result: MetadataUploadResult }>();

function dedupKeyOf(
  imageSha: `0x${string}`,
  imageMime: string,
  tokenName: string,
  tokenSymbol: string,
  tokenDescription: string,
): string {
  return keccak256(
    stringToHex(JSON.stringify([imageSha, imageMime, tokenName, tokenSymbol, tokenDescription])),
  );
}

export async function POST(req: Request): Promise<Response> {
  try {
    const originProblem = assertSameOrigin(req);
    if (originProblem) return err("BAD_ORIGIN", originProblem, 403);
    if (rateLimited(`meta:${clientKey(req)}`, 6))
      return err("RATE_LIMITED", "Too many requests.", 429);

    const flags = getFlags();
    const len = Number(req.headers.get("content-length") ?? "0");
    if (!len || len > flags.metadataMaxBytes + 64 * 1024) {
      return err("BODY_TOO_LARGE", "Payload too large.", 413);
    }

    const form = await req.formData();
    const walletRaw = form.get("wallet");
    const image = form.get("image");
    const fieldsRaw = form.get("fields");
    if (
      typeof walletRaw !== "string" ||
      typeof fieldsRaw !== "string" ||
      !(image instanceof File)
    ) {
      return err("BAD_FORM", "Expected wallet, fields, and image parts.");
    }
    // The wallet is a plain CLAIMED address — deliberately unauthenticated
    // (the deployment transaction authenticates the creator later). It is
    // validated as an address and used ONLY as a rate-limit key.
    if (!isAddress(walletRaw)) return err("BAD_WALLET", "wallet must be a valid address.");
    if (rateLimited(`meta-wallet:${walletRaw.toLowerCase()}`, 6))
      return err("RATE_LIMITED", "Too many requests for this wallet.", 429);

    let parsedFields: Record<string, unknown>;
    try {
      parsedFields = JSON.parse(fieldsRaw) as Record<string, unknown>;
    } catch {
      return err("BAD_FORM", "fields must be valid JSON.");
    }
    const tokenName = parsedFields.tokenName;
    const tokenSymbol = parsedFields.tokenSymbol;
    const tokenDescription = parsedFields.tokenDescription;
    if (
      typeof tokenName !== "string" ||
      typeof tokenSymbol !== "string" ||
      typeof tokenDescription !== "string"
    ) {
      return err("BAD_FORM", "fields must contain tokenName, tokenSymbol, tokenDescription.");
    }
    if (!ALLOWED_MIME.has(image.type))
      return err("BAD_IMAGE_TYPE", "Image must be PNG, JPEG, or WebP.");

    const bytes = new Uint8Array(await image.arrayBuffer());
    const imageSha = keccak256(bytes);

    // Deduplicate identical content: same bytes + fields inside the TTL reuse
    // the already-pinned CIDs instead of re-uploading to Pinata.
    const now = Date.now();
    for (const [k, v] of dedupCache) if (now - v.at > DEDUP_TTL_MS) dedupCache.delete(k);
    const dedupKey = dedupKeyOf(imageSha, image.type, tokenName, tokenSymbol, tokenDescription);
    const cached = dedupCache.get(dedupKey);
    if (cached) return ok(cached.result);

    const input: MetadataInput = {
      tokenName,
      tokenSymbol,
      tokenDescription,
      imageBytes: bytes,
      imageMime: image.type as MetadataInput["imageMime"],
      imageFilename: image.name || "token-image",
    };
    const result = await uploadMetadataViaPinata(input);
    if (result.provider === "pinata") dedupCache.set(dedupKey, { at: now, result });
    return ok(result);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Invalid metadata"))
      return err("INVALID_METADATA", e.message);
    return mapError(e);
  }
}
