import { parse } from "csv-parse/sync";

export type ValidationStatus = "valid" | "risky" | "invalid";
export type LeadTemperature = "HOT" | "WARM" | "COLD";

export type ParsedCsvContact = {
  firstName: string | null;
  lastName: string | null;
  email: string;
  title: string | null;
  company: string | null;
  linkedinUrl: string | null;
};

export type ContactEnrichment = {
  companyName: string;
  companyDomain: string | null;
  industry: string;
  employeeCount: number;
  confidence: number;
};

export type ValidationResult = {
  status: ValidationStatus;
  reasons: string[];
};

export type ScoredContact = {
  score: number;
  temperature: LeadTemperature;
};

const ROLE_BASED_LOCALS = new Set(["admin", "billing", "careers", "contact", "help", "hello", "hr", "info", "jobs", "marketing", "sales", "support"]);

const DISPOSABLE_DOMAINS = new Set(["10minutemail.com", "guerrillamail.com", "mailinator.com", "tempmail.com", "yopmail.com"]);

const FREE_EMAIL_DOMAINS = new Set(["gmail.com", "outlook.com", "hotmail.com", "icloud.com", "protonmail.com", "yahoo.com"]);

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const DECISION_MAKER_PATTERN = /\b(founder|owner|chief|ceo|cmo|coo|cto|cfo|vp|vice president|head|director|partner|principal)\b/i;

function normaliseHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getField(record: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    if (record[alias] && record[alias].trim()) {
      return record[alias].trim();
    }
  }
  return null;
}

function inferNameParts(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (!fullName) {
    return { firstName: null, lastName: null };
  }
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: null, lastName: null };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function hashSeed(value: string): number {
  return Array.from(value).reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function inferIndustry(domain: string | null, companyName: string): string {
  const source = `${domain ?? ""} ${companyName}`.toLowerCase();
  if (/(shop|store|commerce|retail)/.test(source)) return "Ecommerce";
  if (/(agency|consult|studio|marketing)/.test(source)) return "Professional Services";
  if (/(health|care|clinic|med)/.test(source)) return "Healthcare";
  if (/(factory|manufact|industrial)/.test(source)) return "Manufacturing";
  return "SaaS";
}

function deriveCompanyName(email: string, fallback: string | null): string {
  if (fallback) return fallback;
  const domain = email.split("@")[1] ?? "";
  const root = domain.split(".")[0] ?? "Company";
  return root.charAt(0).toUpperCase() + root.slice(1);
}

export function parseCsvContacts(csvText: string): ParsedCsvContact[] {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Array<Record<string, string>>;

  return records
    .map((record) => {
      const normalisedRecord = Object.fromEntries(Object.entries(record).map(([key, value]) => [normaliseHeader(key), value]));
      const fullName = getField(normalisedRecord, ["name", "fullname", "contactname"]);
      const parsedName = inferNameParts(fullName);
      const firstName = getField(normalisedRecord, ["firstname", "first"]) ?? parsedName.firstName;
      const lastName = getField(normalisedRecord, ["lastname", "last"]) ?? parsedName.lastName;
      const email = getField(normalisedRecord, ["email", "workemail"]);
      const title = getField(normalisedRecord, ["title", "jobtitle", "role"]);
      const company = getField(normalisedRecord, ["company", "companyname", "account"]);
      const linkedinUrl = getField(normalisedRecord, ["linkedin", "linkedinurl", "linkedinprofile"]);

      if (!email) {
        return null;
      }

      return {
        firstName,
        lastName,
        email: email.toLowerCase(),
        title,
        company,
        linkedinUrl,
      };
    })
    .filter((item): item is ParsedCsvContact => Boolean(item));
}

export function runEmailValidation(email: string): ValidationResult {
  const reasons: string[] = [];
  const lowerEmail = email.toLowerCase();
  const [localPart, domain = ""] = lowerEmail.split("@");

  if (!EMAIL_PATTERN.test(lowerEmail)) {
    return { status: "invalid", reasons: ["Invalid email syntax"] };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { status: "invalid", reasons: ["Disposable mailbox domain"] };
  }

  if (ROLE_BASED_LOCALS.has(localPart)) {
    reasons.push("Role-based mailbox");
  }

  if (FREE_EMAIL_DOMAINS.has(domain)) {
    reasons.push("Free email provider");
  }

  if (/\b(test|example)\b/.test(domain) || domain.endsWith(".invalid")) {
    return { status: "invalid", reasons: ["Domain failed validation checks"] };
  }

  if (reasons.length) {
    return { status: "risky", reasons };
  }

  return { status: "valid", reasons: ["Email validated"] };
}

export function enrichContact(parsedContact: ParsedCsvContact): ContactEnrichment {
  const domain = parsedContact.email.includes("@") ? parsedContact.email.split("@")[1] : null;
  const companyName = deriveCompanyName(parsedContact.email, parsedContact.company);
  const seed = hashSeed(`${parsedContact.email}${companyName}`);
  const employeeCount = 10 + (seed % 900);
  const industry = inferIndustry(domain, companyName);
  const confidence = 70 + (seed % 30);

  return {
    companyName,
    companyDomain: domain,
    industry,
    employeeCount,
    confidence,
  };
}

export function scoreContact(parsedContact: ParsedCsvContact, validation: ValidationResult, enrichment: ContactEnrichment): ScoredContact {
  let score = 0;

  if (validation.status === "valid") score += 35;
  if (validation.status === "risky") score += 15;
  if (validation.status === "invalid") score += 0;

  if (parsedContact.title) score += 10;
  if (parsedContact.linkedinUrl) score += 10;
  if (parsedContact.company || enrichment.companyName) score += 10;
  if (enrichment.employeeCount >= 20 && enrichment.employeeCount <= 500) score += 10;
  if (enrichment.confidence >= 80) score += 10;
  if (parsedContact.title && DECISION_MAKER_PATTERN.test(parsedContact.title)) score += 15;
  if (enrichment.companyDomain && !FREE_EMAIL_DOMAINS.has(enrichment.companyDomain)) score += 10;

  const finalScore = Math.max(0, Math.min(100, score));
  const temperature: LeadTemperature = finalScore >= 70 ? "HOT" : finalScore >= 40 ? "WARM" : "COLD";

  return {
    score: finalScore,
    temperature,
  };
}
