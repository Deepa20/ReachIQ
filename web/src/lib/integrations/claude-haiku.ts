export type OutreachTone = "Warm" | "Direct" | "Consultative" | "Peer to Peer";

export type ClaudeEmailInput = {
  name: string;
  title: string;
  company: string;
  industry: string;
  signal: string;
  productDescription: string;
  tone: OutreachTone;
};

export type ClaudeEmailOutput = {
  subjectLine: string;
  personalizedEmail: string;
  model: string;
};

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextBlock[];
};

function getAnthropicApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return apiKey;
}

function getAnthropicBaseUrl(): string {
  return process.env.ANTHROPIC_API_BASE_URL ?? "https://api.anthropic.com";
}

function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
}

function extractJsonObject(rawText: string): Record<string, unknown> {
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Claude response did not include JSON");
    }
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

function validateOutput(parsed: Record<string, unknown>): { subjectLine: string; personalizedEmail: string } {
  const subjectLine = typeof parsed.subject_line === "string" ? parsed.subject_line.trim() : "";
  const personalizedEmail = typeof parsed.personalized_email === "string" ? parsed.personalized_email.trim() : "";

  if (!subjectLine || !personalizedEmail) {
    throw new Error("Claude response missing required keys");
  }

  return { subjectLine, personalizedEmail };
}

function buildPrompt(input: ClaudeEmailInput): string {
  return `
You are writing outbound B2B prospecting emails for ReachIQ.

Prospect context:
- Name: ${input.name}
- Title: ${input.title}
- Company: ${input.company}
- Industry: ${input.industry}
- Signal: ${input.signal}

Product:
${input.productDescription}

Tone:
${input.tone}

Instructions:
- Keep email concise (90-150 words).
- Personalize opening to the signal and role.
- Include one clear CTA.
- Avoid hype and buzzwords.
- Return valid JSON only.
- JSON keys must be exactly: subject_line, personalized_email
`;
}

export async function generateClaudeHaikuEmail(input: ClaudeEmailInput): Promise<ClaudeEmailOutput> {
  const apiKey = getAnthropicApiKey();
  const baseUrl = getAnthropicBaseUrl();
  const model = getAnthropicModel();

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: buildPrompt(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as AnthropicResponse;
  const text = payload.content?.find((block) => block.type === "text")?.text;

  if (!text) {
    throw new Error("Claude response was empty");
  }

  const parsed = extractJsonObject(text);
  const output = validateOutput(parsed);

  return {
    subjectLine: output.subjectLine,
    personalizedEmail: output.personalizedEmail,
    model,
  };
}
