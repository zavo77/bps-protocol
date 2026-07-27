// POST multipart/form-data: envelope (signed request JSON) + image file.
// Uploads image + metadata JSON to Pinata after signature/allowlist checks.

import { keccak256, stringToHex } from "viem";
import { signedRequestSchema, uploadMetadataViaPinata, type MetadataInput } from "@bps/launch-lab";
import { getFlags, verifySignedRequest, payloadHashOf } from "../../../../lib/lab/server";
import { assertSignatureUnused } from "../../../../lib/lab/store";
import {
  assertSameOrigin,
  clientKey,
  err,
  mapError,
  ok,
  rateLimited,
  requestHost,
} from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

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
    const envelopeRaw = form.get("envelope");
    const image = form.get("image");
    const fieldsRaw = form.get("fields");
    if (
      typeof envelopeRaw !== "string" ||
      typeof fieldsRaw !== "string" ||
      !(image instanceof File)
    ) {
      return err("BAD_FORM", "Expected envelope, fields, and image parts.");
    }
    const envelope = signedRequestSchema.parse(JSON.parse(envelopeRaw));
    const fields = JSON.parse(fieldsRaw) as {
      tokenName: string;
      tokenSymbol: string;
      tokenDescription: string;
    };
    if (!ALLOWED_MIME.has(image.type))
      return err("BAD_IMAGE_TYPE", "Image must be PNG, JPEG, or WebP.");

    const bytes = new Uint8Array(await image.arrayBuffer());
    const imageSha = keccak256(bytes);
    const expectedPayloadHash = payloadHashOf({
      tokenName: fields.tokenName,
      tokenSymbol: fields.tokenSymbol,
      tokenDescription: fields.tokenDescription,
      imageHash: imageSha,
      imageMime: image.type,
    });
    await verifySignedRequest(envelope, {
      action: "metadata-upload",
      payloadHash: expectedPayloadHash,
      host: requestHost(req),
    });
    await assertSignatureUnused(
      keccak256(stringToHex(envelope.signature)),
      flags.requestTtlSeconds * 1000,
    );

    const input: MetadataInput = {
      tokenName: fields.tokenName,
      tokenSymbol: fields.tokenSymbol,
      tokenDescription: fields.tokenDescription,
      imageBytes: bytes,
      imageMime: image.type as MetadataInput["imageMime"],
      imageFilename: image.name || "token-image",
    };
    const result = await uploadMetadataViaPinata(input);
    return ok(result);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Invalid metadata"))
      return err("INVALID_METADATA", e.message);
    return mapError(e);
  }
}
