type ApolloPerson = {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  organization?: {
    name?: string | null;
    primary_domain?: string | null;
    industry?: string | null;
    estimated_num_employees?: number | null;
  } | null;
};

type ApolloResponse = {
  person?: ApolloPerson | null;
  data?: {
    person?: ApolloPerson | null;
  } | null;
  errors?: Array<{ message?: string }>;
};

export type ApolloEnrichmentInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
};

export type ApolloEnrichmentResult = {
  provider: "apollo";
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  company: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
  companySize: number | null;
  industry: string | null;
  raw: ApolloPerson;
};

function getApolloApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    throw new Error("Missing required environment variable: APOLLO_API_KEY");
  }
  return key;
}

function getApolloBaseUrl(): string {
  return process.env.APOLLO_API_BASE_URL ?? "https://api.apollo.io/api/v1";
}

function getApolloMaxRetries(): number {
  const parsed = Number(process.env.APOLLO_MAX_RETRIES ?? "3");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3;
  }
  return Math.floor(parsed);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

async function apolloRequest(path: string, body: Record<string, unknown>): Promise<ApolloResponse> {
  const apiKey = getApolloApiKey();
  const maxRetries = getApolloMaxRetries();
  const endpoint = `${getApolloBaseUrl().replace(/\/$/, "")}${path}`;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = (await response.json()) as ApolloResponse;
    if (response.ok) {
      return payload;
    }

    if (attempt < maxRetries && shouldRetry(response.status)) {
      const backoffMs = 250 * 2 ** (attempt - 1);
      await wait(backoffMs);
      continue;
    }

    const message = payload.errors?.[0]?.message ?? `Apollo request failed (${response.status})`;
    throw new Error(message);
  }

  throw new Error("Apollo request failed after max retries");
}

function normaliseApolloPerson(response: ApolloResponse): ApolloPerson {
  const person = response.person ?? response.data?.person ?? null;
  if (!person) {
    throw new Error("Apollo did not return a person match");
  }
  return person;
}

export async function enrichContact(input: ApolloEnrichmentInput): Promise<ApolloEnrichmentResult> {
  const payload = await apolloRequest("/people/match", {
    email: input.email ?? undefined,
    first_name: input.firstName ?? undefined,
    last_name: input.lastName ?? undefined,
    organization_name: input.companyName ?? undefined,
    domain: input.companyDomain ?? undefined,
    linkedin_url: input.linkedinUrl ?? undefined,
    reveal_personal_emails: false,
  });

  const person = normaliseApolloPerson(payload);
  const organization = person.organization ?? {};
  const derivedName = [person.first_name, person.last_name].filter(Boolean).join(" ");
  const name = person.name ?? (derivedName || null);

  return {
    provider: "apollo",
    name,
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
    jobTitle: person.title ?? null,
    company: organization.name ?? input.companyName ?? null,
    companyDomain: organization.primary_domain ?? input.companyDomain ?? null,
    linkedinUrl: person.linkedin_url ?? input.linkedinUrl ?? null,
    companySize: organization.estimated_num_employees ?? null,
    industry: organization.industry ?? null,
    raw: person,
  };
}
