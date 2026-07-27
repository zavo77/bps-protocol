import { publicConfig } from "../../../../lib/lab/server";
import { mapError, ok } from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return ok(publicConfig());
  } catch (e) {
    return mapError(e);
  }
}
