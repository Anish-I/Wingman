import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const COMPOSIO_TIMEOUT_MS = 30_000;

export type ExecuteToolArgs = {
  sessionId: string;
  toolSlug: string;
  accountId?: string | null;
  input: Record<string, unknown>;
};

export class ComposioService {
  async executeTool(args: ExecuteToolArgs) {
    const response = await fetch(
      `${env.COMPOSIO_BASE_URL}/api/v3/tool_router/session/${encodeURIComponent(args.sessionId)}/execute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.COMPOSIO_API_KEY
        },
        signal: AbortSignal.timeout(COMPOSIO_TIMEOUT_MS),
        body: JSON.stringify({
          tool_slug: args.toolSlug,
          arguments: args.input,
          ...(args.accountId ? { account: args.accountId } : {})
        })
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new AppError(
        response.status,
        'COMPOSIO_EXECUTION_FAILED',
        'Composio tool execution failed.',
        payload
      );
    }

    return payload;
  }
}
