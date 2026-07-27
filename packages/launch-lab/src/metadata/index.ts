// Token metadata provider. Production = Pinata via server-only routes; a local
// preview provider exists for tests/design only. Broadcast must fail closed
// unless the production provider returned a real ipfs:// URI.

export interface MetadataUploadResult {
  imageCid: string;
  metadataCid: string;
  /** ipfs://<metadataCid> — goes into tokenURI. */
  tokenUri: string;
  provider: "pinata" | "local-preview";
}

export interface MetadataInput {
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  imageBytes: Uint8Array;
  imageMime: "image/png" | "image/jpeg" | "image/webp";
  imageFilename: string;
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
const MAGIC: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

export function validateMetadataInput(input: MetadataInput): string[] {
  const errors: string[] = [];
  if (!/^[\x20-\x7E]{1,48}$/.test(input.tokenName))
    errors.push("Token name must be 1-48 printable ASCII characters.");
  if (!/^[A-Z0-9]{1,12}$/.test(input.tokenSymbol))
    errors.push("Ticker must be 1-12 characters A-Z or 0-9.");
  if (input.tokenDescription.length < 1 || input.tokenDescription.length > 600)
    errors.push("Description must be 1-600 characters.");
  if (/[<>]/.test(input.tokenDescription) || /[<>]/.test(input.tokenName))
    errors.push("HTML characters are not allowed.");
  if (!ALLOWED_MIME.includes(input.imageMime)) errors.push("Image must be PNG, JPEG, or WebP.");
  if (input.imageBytes.length === 0 || input.imageBytes.length > MAX_IMAGE_BYTES)
    errors.push("Image must be 1 byte to 4 MB.");
  const magic = MAGIC[input.imageMime];
  if (magic && !magic.every((b, i) => input.imageBytes[i] === b))
    errors.push("Image bytes do not match the declared type.");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(input.imageFilename))
    errors.push("Image filename contains unsafe characters.");
  return errors;
}

const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

/** Uploads image then metadata JSON to Pinata. Server-side only; JWT from env. */
export async function uploadMetadataViaPinata(input: MetadataInput): Promise<MetadataUploadResult> {
  const errors = validateMetadataInput(input);
  if (errors.length > 0) throw new Error(`Invalid metadata: ${errors.join(" ")}`);
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT is not configured.");

  const form = new FormData();
  form.append(
    "file",
    new File([input.imageBytes as unknown as BlobPart], input.imageFilename, {
      type: input.imageMime,
    }),
  );
  const fileRes = await fetch(PINATA_FILE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!fileRes.ok) throw new Error(`Pinata image upload failed (${fileRes.status}).`);
  const fileJson = (await fileRes.json()) as { IpfsHash?: string };
  if (!fileJson.IpfsHash) throw new Error("Pinata image upload returned no CID.");
  const imageCid = fileJson.IpfsHash;

  const metadata = {
    name: input.tokenName,
    symbol: input.tokenSymbol,
    description: input.tokenDescription,
    image: `ipfs://${imageCid}`,
  };
  const jsonRes = await fetch(PINATA_JSON_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pinataContent: metadata }),
  });
  if (!jsonRes.ok) throw new Error(`Pinata metadata upload failed (${jsonRes.status}).`);
  const jsonJson = (await jsonRes.json()) as { IpfsHash?: string };
  if (!jsonJson.IpfsHash) throw new Error("Pinata metadata upload returned no CID.");

  return {
    imageCid,
    metadataCid: jsonJson.IpfsHash,
    tokenUri: `ipfs://${jsonJson.IpfsHash}`,
    provider: "pinata",
  };
}

/** Test/design-only provider. NEVER acceptable for broadcast. */
export function localPreviewMetadata(input: MetadataInput): MetadataUploadResult {
  const errors = validateMetadataInput(input);
  if (errors.length > 0) throw new Error(`Invalid metadata: ${errors.join(" ")}`);
  return {
    imageCid: "local-preview-image",
    metadataCid: "local-preview-metadata",
    tokenUri: "ipfs://local-preview-metadata",
    provider: "local-preview",
  };
}

/** Broadcast gate: only a real Pinata ipfs:// URI may reach the chain. */
export function isBroadcastableTokenUri(result: MetadataUploadResult | null | undefined): boolean {
  return (
    !!result &&
    result.provider === "pinata" &&
    result.tokenUri.startsWith("ipfs://") &&
    result.metadataCid.length > 10
  );
}
