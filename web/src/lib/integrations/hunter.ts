type HunterEmailVerifierData = {
  status: string;
  result?: string;
  score?: number;
  disposable?: boolean;
  webmail?: boolean;
  accept_all?: boolean;
  mx_records?: boolean;
  smtp_check?: boolean;
  block?: boolean;
};

type HunterDomainData = {
  domain?: string;
  disposable?: boolean;
  webmail?: boolean;
};

type HunterApiEnvelope<TData> = {
  data: TData;
  errors?: Array<{ id?: number; code?: string; details?: string }>;
};

export type HunterValidationResult = {
  provider: "hunter.io";
  status: "valid" | "risky" | "invalid";
  score: number;
  reasons: string[];
  raw: HunterEmailVerifierData;
};

export type HunterDomainVerification = {
  exists: boolean;
  disposable: boolean;
  webmail: boolean;
  raw: HunterDomainData | null;
};

type RateLimitState = {
  timestamps: number[];
};

const rateLimitState: RateLimitState = {
  timestamps: [],
};

function getHunterApiKey(): string {
  const key = process.env.HUNTER_API_KEY;
  if (!key) {
    throw new Error("Missing required environment variable: HUNTER_API_KEY");
  }
  return key;
}

function getRateLimitPerMinute(): number {
  const parsed = Number(process.env.HUNTER_RATE_LIMIT_PER_MINUTE ?? "50");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.floor(parsed);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function applyRateLimit() {
  const maxPerMinute = getRateLimitPerMinute();
  const now = Date.now();
  rateLimitState.timestamps = rateLimitState.timestamps.filter((timestamp) => now - timestamp < 60_000);

  if (rateLimitState.timestamps.length >= maxPerMinute) {
    const oldest = rateLimitState.timestamps[0];
    const waitMs = Math.max(0, 60_000 - (now - oldest)) + 50;
    await wait(waitMs);
    const refreshedNow = Date.now();
    rateLimitState.timestamps = rateLimitState.timestamps.filter((timestamp) => refreshedNow - timestamp < 60_000);
  }

  rateLimitState.timestamps.push(Date.now());
}

async function hunterRequest<TData>(path: string, searchParams: Record<string, string>): Promise<HunterApiEnvelope<TData>> {
  await applyRateLimit();
  const apiKey = getHunterApiKey();

  const url = new URL(`https://api.hunter.io/v2/${path}`);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const payload = (await response.json()) as HunterApiEnvelope<TData>;

  if (!response.ok) {
    const message = payload.errors?.[0]?.details || payload.errors?.[0]?.code || `Hunter request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

export async function validateEmail(email: string): Promise<HunterValidationResult> {
  const payload = await hunterRequest<HunterEmailVerifierData>("email-verifier", { email: email.toLowerCase() });
  const data = payload.data;
  const reasons: string[] = [];

  if (data.disposable) reasons.push("Disposable mailbox");
  if (data.webmail) reasons.push("Webmail provider");
  if (data.accept_all) reasons.push("Catch-all domain");
  if (data.mx_records === false) reasons.push("Missing MX records");
  if (data.smtp_check === false) reasons.push("SMTP check failed");
  if (data.block) reasons.push("Mailbox appears blocked");

  let status: HunterValidationResult["status"] = "risky";
  if (data.status === "invalid" || data.result === "undeliverable" || data.block || data.mx_records === false) {
    status = "invalid";
  } else if (data.status === "valid" && !data.accept_all && !data.disposable && !data.webmail) {
    status = "valid";
  }

  const score = Math.max(0, Math.min(100, Math.round(data.score ?? (status === "valid" ? 90 : status === "risky" ? 60 : 10))));
  if (!reasons.length) {
    reasons.push(`Hunter status: ${data.status || "unknown"}`);
  }

  return {
    provider: "hunter.io",
    status,
    score,
    reasons,
    raw: data,
  };
}

export async function verifyDomain(domain: string): Promise<HunterDomainVerification> {
  const normalizedDomain = domain.toLowerCase().trim();
  if (!normalizedDomain) {
    return {
      exists: false,
      disposable: false,
      webmail: false,
      raw: null,
    };
  }

  const payload = await hunterRequest<HunterDomainData>("domain-search", {
    domain: normalizedDomain,
    limit: "1",
  });
  const data = payload.data;
  const exists = Boolean(data.domain && data.domain.length > 0);

  return {
    exists,
    disposable: Boolean(data.disposable),
    webmail: Boolean(data.webmail),
    raw: data,
  };
}

export async function checkCatchAll(email: string, validationData?: HunterEmailVerifierData): Promise<boolean> {
  if (validationData) {
    return Boolean(validationData.accept_all);
  }
  const validation = await validateEmail(email);
  return Boolean(validation.raw.accept_all);
}
