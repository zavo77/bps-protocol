import { resolveAnchor } from '@bps/launch-lab';
import { getLabClient } from '../../../../../lib/lab/server';
import { mapError, ok } from '../../../../../lib/lab/http';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const anchor = await resolveAnchor(getLabClient());
    return ok(anchor);
  } catch (e) {
    return mapError(e);
  }
}
