// Trading quotes land with the integrated-trading phase (after the launch is
// proven, per the delivery priority order). Fail closed — never fabricate.

import { err } from '../../../../lib/lab/http';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return err('QUOTE_NOT_YET_AVAILABLE', 'Integrated quoting is not enabled yet. Use the verified external trading link.', 501);
}
