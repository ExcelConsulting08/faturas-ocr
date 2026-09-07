import "server-only";

import { ConfidentialClientApplication } from "@azure/msal-node";

const SCOPE = "https://graph.microsoft.com/.default";
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

let cachedApp: ConfidentialClientApplication | null = null;

export function isGraphConfigured(): boolean {
  return Boolean(
    process.env.MS_GRAPH_TENANT_ID &&
      process.env.MS_GRAPH_CLIENT_ID &&
      process.env.MS_GRAPH_CLIENT_SECRET,
  );
}

export function missingGraphEnvVars(): string[] {
  return ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET"].filter(
    (name) => !process.env[name],
  );
}

function getApp(): ConfidentialClientApplication {
  if (!isGraphConfigured()) {
    throw new Error(`Credenciais do Microsoft Graph em falta: ${missingGraphEnvVars().join(", ")}`);
  }

  cachedApp ??= new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MS_GRAPH_CLIENT_ID!,
      clientSecret: process.env.MS_GRAPH_CLIENT_SECRET!,
      authority: `https://login.microsoftonline.com/${process.env.MS_GRAPH_TENANT_ID}`,
    },
  });

  return cachedApp;
}

export async function getGraphToken(): Promise<string> {
  // O MSAL trata da cache e da renovação do token internamente.
  const result = await getApp().acquireTokenByClientCredential({ scopes: [SCOPE] });
  if (!result?.accessToken) {
    throw new Error("Não foi possível obter um token do Microsoft Graph");
  }
  return result.accessToken;
}

export interface GraphRequestOptions {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  /** Número de tentativas em caso de throttling (429) ou erro transitório 5xx. */
  maxRetries?: number;
}

/**
 * Chamada ao Graph com retry que respeita o cabeçalho Retry-After.
 * `path` pode ser relativo (juntado a GRAPH_BASE) ou um URL absoluto.
 */
export async function graphFetch(
  path: string,
  { method = "GET", body = null, headers = {}, maxRetries = 4 }: GraphRequestOptions = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  const token = await getGraphToken();

  let attempt = 0;
  for (;;) {
    const response = await fetch(url, {
      method,
      body,
      headers: { Authorization: `Bearer ${token}`, ...headers },
    });

    const isRetryable = response.status === 429 || response.status >= 500;
    if (!isRetryable || attempt >= maxRetries) return response;

    const retryAfter = Number(response.headers.get("Retry-After"));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(2 ** attempt * 1000, 16000);

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    attempt++;
  }
}

export async function graphJson<T>(path: string, options?: GraphRequestOptions): Promise<T> {
  const response = await graphFetch(path, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph ${response.status} em ${path}: ${text.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}
