import { publicConfig } from "../../../../lib/lab/server";
import { countLaunchesToday } from "../../../../lib/lab/store";
import { mapError, ok } from "../../../../lib/lab/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return ok(publicConfig(await countLaunchesToday()));
  } catch (e) {
    return mapError(e);
  }
}
