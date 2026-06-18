import { decryptToken } from '@/services/auth/tokens';

export type RevocablePlatform = 'github' | 'gmail' | 'google_calendar' | 'google_docs' | 'google_sheets' | 'google_slides' | 'google_meet' | 'google_chat' | 'google_maps' | 'youtube' | 'reddit' | 'notion';
export type ProviderName = 'github' | 'google' | 'reddit' | 'notion';

export type ProviderRevocationResult = {
  provider: ProviderName;
  platform: RevocablePlatform;
  attempted: boolean;
  status: 'success' | 'failed' | 'skipped';
  httpStatus: number | null;
  message: string;
};

const REQUEST_TIMEOUT_MS = 5500;

function cleanBodySnippet(body: string) {
  return body.replace(/\s+/g, ' ').trim().slice(0, 180);
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function decodeToken(token: string | null | undefined) {
  if (!token) return { token: null as string | null, error: null as string | null };

  try {
    return { token: decryptToken(token), error: null as string | null };
  } catch (error) {
    return {
      token: null as string | null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function providerForPlatform(platform: RevocablePlatform): ProviderName {
  if (platform === 'gmail' || platform.startsWith('google_') || platform === 'youtube') {
    return 'google';
  }

  return platform as ProviderName;
}

function buildTokenDecodeError(platform: RevocablePlatform, provider: ProviderName, accessError: string | null, refreshError: string | null) {
  const detail = [accessError, refreshError].filter(Boolean).join(' | ');

  return {
    provider,
    platform,
    attempted: false,
    status: 'failed' as const,
    httpStatus: null,
    message: `Unable to decode provider token: ${detail || 'unknown error'}`,
  };
}

async function revokeGoogleToken(platform: RevocablePlatform, accessToken: string | null, refreshToken: string | null): Promise<ProviderRevocationResult> {
  const candidates = [refreshToken, accessToken].filter((value): value is string => Boolean(value));

  if (candidates.length === 0) {
    return {
      provider: 'google',
      platform,
      attempted: false,
      status: 'skipped',
      httpStatus: null,
      message: 'No Google token available to revoke.',
    };
  }

  let lastError: ProviderRevocationResult | null = null;

  for (const token of candidates) {
    try {
      const response = await fetchWithTimeout('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token }),
      });

      if (response.ok || response.status === 400) {
        return {
          provider: 'google',
          platform,
          attempted: true,
          status: 'success',
          httpStatus: response.status,
          message: response.ok ? 'Google token revoked.' : 'Google token already revoked or invalid.',
        };
      }

      const body = cleanBodySnippet(await response.text());
      lastError = {
        provider: 'google',
        platform,
        attempted: true,
        status: 'failed',
        httpStatus: response.status,
        message: `Google revoke failed (${response.status})${body ? `: ${body}` : ''}`,
      };
    } catch (error) {
      lastError = {
        provider: 'google',
        platform,
        attempted: true,
        status: 'failed',
        httpStatus: null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return (
    lastError ?? {
      provider: 'google',
      platform,
      attempted: false,
      status: 'skipped',
      httpStatus: null,
      message: 'Google token revocation skipped.',
    }
  );
}

async function revokeGitHubToken(platform: RevocablePlatform, accessToken: string | null): Promise<ProviderRevocationResult> {
  if (!accessToken) {
    return {
      provider: 'github',
      platform,
      attempted: false,
      status: 'skipped',
      httpStatus: null,
      message: 'No GitHub token available to revoke.',
    };
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      provider: 'github',
      platform,
      attempted: false,
      status: 'skipped',
      httpStatus: null,
      message: 'GitHub OAuth client credentials are missing. Local disconnect completed without remote revoke.',
    };
  }

  try {
    const response = await fetchWithTimeout(`https://api.github.com/applications/${encodeURIComponent(clientId)}/token`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
    });

    if ([200, 204, 404].includes(response.status)) {
      return {
        provider: 'github',
        platform,
        attempted: true,
        status: 'success',
        httpStatus: response.status,
        message: response.status === 404 ? 'GitHub token was already invalid.' : 'GitHub token revoked.',
      };
    }

    const body = cleanBodySnippet(await response.text());
    return {
      provider: 'github',
      platform,
      attempted: true,
      status: 'failed',
      httpStatus: response.status,
      message: `GitHub revoke failed (${response.status})${body ? `: ${body}` : ''}`,
    };
  } catch (error) {
    return {
      provider: 'github',
      platform,
      attempted: true,
      status: 'failed',
      httpStatus: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function revokeRedditToken(platform: RevocablePlatform, accessToken: string | null, refreshToken: string | null): Promise<ProviderRevocationResult> {
  const token = refreshToken || accessToken;
  const tokenHint = refreshToken ? 'refresh_token' : 'access_token';

  if (!token) {
    return {
      provider: 'reddit',
      platform,
      attempted: false,
      status: 'skipped',
      httpStatus: null,
      message: 'No Reddit token available to revoke.',
    };
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      provider: 'reddit',
      platform,
      attempted: false,
      status: 'skipped',
      httpStatus: null,
      message: 'Reddit OAuth client credentials are missing. Local disconnect completed without remote revoke.',
    };
  }

  try {
    const response = await fetchWithTimeout('https://www.reddit.com/api/v1/revoke_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'the-eyes/1.0',
      },
      body: new URLSearchParams({
        token,
        token_type_hint: tokenHint,
      }),
    });

    if (response.ok || response.status === 204) {
      return {
        provider: 'reddit',
        platform,
        attempted: true,
        status: 'success',
        httpStatus: response.status,
        message: 'Reddit token revoked.',
      };
    }

    const body = cleanBodySnippet(await response.text());
    return {
      provider: 'reddit',
      platform,
      attempted: true,
      status: 'failed',
      httpStatus: response.status,
      message: `Reddit revoke failed (${response.status})${body ? `: ${body}` : ''}`,
    };
  } catch (error) {
    return {
      provider: 'reddit',
      platform,
      attempted: true,
      status: 'failed',
      httpStatus: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function revokeNotionToken(platform: RevocablePlatform, accessToken: string | null): Promise<ProviderRevocationResult> {
  if (!accessToken) {
    return {
      provider: 'notion',
      platform,
      attempted: false,
      status: 'skipped',
      httpStatus: null,
      message: 'No Notion token available to revoke.',
    };
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      provider: 'notion',
      platform,
      attempted: false,
      status: 'skipped',
      httpStatus: null,
      message: 'Notion OAuth client credentials are missing. Local disconnect completed without remote revoke.',
    };
  }

  try {
    const response = await fetchWithTimeout('https://api.notion.com/v1/oauth/revoke', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: accessToken }),
    });

    if (response.ok || response.status === 204) {
      return {
        provider: 'notion',
        platform,
        attempted: true,
        status: 'success',
        httpStatus: response.status,
        message: 'Notion token revoked.',
      };
    }

    const body = cleanBodySnippet(await response.text());
    return {
      provider: 'notion',
      platform,
      attempted: true,
      status: 'failed',
      httpStatus: response.status,
      message: `Notion revoke failed (${response.status})${body ? `: ${body}` : ''}`,
    };
  } catch (error) {
    return {
      provider: 'notion',
      platform,
      attempted: true,
      status: 'failed',
      httpStatus: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function revokeProviderAccess(params: {
  platform: RevocablePlatform;
  encryptedAccessToken: string | null | undefined;
  encryptedRefreshToken?: string | null | undefined;
}): Promise<ProviderRevocationResult> {
  const { platform, encryptedAccessToken, encryptedRefreshToken } = params;
  const provider = providerForPlatform(platform);

  const accessDecoded = decodeToken(encryptedAccessToken);
  const refreshDecoded = decodeToken(encryptedRefreshToken);

  if (accessDecoded.error || refreshDecoded.error) {
    return buildTokenDecodeError(platform, provider, accessDecoded.error, refreshDecoded.error);
  }

  if (provider === 'google') {
    return revokeGoogleToken(platform, accessDecoded.token, refreshDecoded.token);
  }

  if (provider === 'github') {
    return revokeGitHubToken(platform, accessDecoded.token);
  }

  if (provider === 'reddit') {
    return revokeRedditToken(platform, accessDecoded.token, refreshDecoded.token);
  }

  return revokeNotionToken(platform, accessDecoded.token);
}

export function isRevocablePlatform(platform: string): platform is RevocablePlatform {
  return ['github', 'gmail', 'google_calendar', 'google_docs', 'google_sheets', 'google_slides', 'google_meet', 'google_chat', 'google_maps', 'youtube', 'reddit', 'notion'].includes(platform);
}
