import { FormEvent, useEffect, useMemo, useState } from "react";
import type React from "react";

type Contact = {
  name: string;
  email: string;
  company: string;
  title: string;
  industry?: string;
  province?: string;
  employees?: number;
  tech_stack?: string[];
  score?: number;
  temperature?: "HOT" | "WARM" | "COLD" | "REMOVED";
  validation_status?: "Valid" | "Risky" | "Invalid";
  validation_reasons?: string[];
  icp_fit_score?: number;
  score_reasons?: string[];
  outreach?: Outreach | null;
  compliance?: {
    flags: string[];
    can_email: boolean;
    retention_policy_days: number;
  };
};

type Outreach = {
  subject_lines: string[];
  body: string;
  personalisation_trigger: string;
  why_this_trigger: string;
  follow_up_sequence: string[];
};

type ValidationResult = {
  summary: {
    uploaded_contacts: number;
    deliverable_contacts: number;
    valid: number;
    risky: number;
    invalid_removed: number;
    hot: number;
    warm: number;
    cold: number;
    list_health_score: number;
    estimated_ai_cost_usd: number;
  };
  contacts: Contact[];
  exports: {
    clean_csv: string;
    crm_targets: string[];
  };
};

type SignalAccount = {
  company: string;
  industry: string;
  priority: boolean;
  engagement_score: number;
  stage: string;
  urgency: string;
  signals: Array<{
    label: string;
    strength: number;
    detected_at: string;
    summary: string;
    recommended_opening_line: string;
    requires_realtime_alert: boolean;
  }>;
};

type SupabaseStatus = {
  configured: boolean;
  mode: string;
  missing?: string[];
  key_source?: string;
  message: string;
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const sampleContacts: Contact[] = [
  {
    name: "Avery Chen",
    email: "avery.chen@pacificsaas.ca",
    company: "Pacific SaaS Co",
    title: "VP Growth",
    industry: "SaaS",
    province: "BC",
    employees: 180,
    tech_stack: ["HubSpot", "Google Analytics"],
    funding_event: true,
    relevant_job_posting: true
  } as Contact,
  {
    name: "Marie Tremblay",
    email: "marie@quebeccommerce.ca",
    company: "Quebec Commerce Group",
    title: "Founder",
    industry: "Ecommerce",
    province: "QC",
    employees: 74,
    tech_stack: ["Shopify", "Klaviyo"],
    job_change: true
  } as Contact,
  {
    name: "Operations Inbox",
    email: "info@fraservalleyfactory.invalid",
    company: "Fraser Valley Manufacturing",
    title: "Operations",
    industry: "Manufacturing",
    province: "BC"
  } as Contact
];

const initialResult: ValidationResult = {
  summary: {
    uploaded_contacts: 3,
    deliverable_contacts: 2,
    valid: 2,
    risky: 0,
    invalid_removed: 1,
    hot: 2,
    warm: 0,
    cold: 0,
    list_health_score: 67,
    estimated_ai_cost_usd: 0.00018
  },
  contacts: [
    {
      ...sampleContacts[0],
      validation_status: "Valid",
      validation_reasons: ["Syntax, domain, mailbox and role checks passed"],
      score: 100,
      temperature: "HOT",
      icp_fit_score: 100,
      score_reasons: ["Funding or budget expansion signal", "Relevant hiring activity", "Decision-maker title"],
      outreach: {
        subject_lines: ["Pacific SaaS Co buying signal", "Idea for Pacific SaaS Co's outbound pipeline", "Quick thought after growth hiring"],
        body: "Hi Avery, I noticed Pacific SaaS Co appears to be in a budget expansion window. That stood out as a timely buying signal: ReachIQ helps Canadian B2B teams validate prospects, spot buying signals, and send relevant outreach from one workflow. Would it be useful if I sent over a short view of the contacts and signals ReachIQ would prioritise for Pacific SaaS Co?",
        personalisation_trigger: "Pacific SaaS Co appears to be in a budget expansion window",
        why_this_trigger: "Selected because it contributed the strongest available score and gives the email a concrete reason to exist.",
        follow_up_sequence: ["Following up because the signal at Pacific SaaS Co still looks timely.", "I can share a sample scored account view."]
      },
      compliance: { flags: ["CASL consent tracking required"], can_email: true, retention_policy_days: 180 }
    },
    {
      ...sampleContacts[1],
      validation_status: "Valid",
      validation_reasons: ["Syntax, domain, mailbox and role checks passed"],
      score: 90,
      temperature: "HOT",
      icp_fit_score: 95,
      score_reasons: ["Job change in last 90 days", "Tech stack matches ICP", "Decision-maker title"],
      outreach: {
        subject_lines: ["Quebec Commerce Group buying signal", "Idea for Quebec Commerce Group's outbound pipeline", "Quick thought after recent leadership change"],
        body: "Hi Marie, I noticed Founder is a recent leadership change. It looks like a timely moment to connect: ReachIQ helps Canadian B2B teams validate prospects, spot buying signals, and send relevant outreach from one workflow.",
        personalisation_trigger: "Founder is a recent leadership change",
        why_this_trigger: "Selected because it contributed the strongest available score and gives the email a concrete reason to exist.",
        follow_up_sequence: ["Following up because the Quebec Commerce Group signal still looks timely."]
      },
      compliance: { flags: ["CASL consent tracking required", "Quebec Law 25 privacy rights notice required"], can_email: true, retention_policy_days: 180 }
    },
    {
      ...sampleContacts[2],
      validation_status: "Invalid",
      validation_reasons: ["Domain verification failed"],
      score: 0,
      temperature: "REMOVED",
      icp_fit_score: 0,
      score_reasons: [],
      outreach: null,
      compliance: { flags: ["CASL consent tracking required", "Role mailbox should be suppressed or manually reviewed"], can_email: false, retention_policy_days: 180 }
    }
  ],
  exports: {
    clean_csv: "name,email,company\nAvery Chen,avery.chen@pacificsaas.ca,Pacific SaaS Co\nMarie Tremblay,marie@quebeccommerce.ca,Quebec Commerce Group",
    crm_targets: ["HubSpot", "Salesforce", "Mailchimp", "Lemlist", "Instantly.ai"]
  }
};

const initialSignals: SignalAccount[] = [
  {
    company: "Pacific SaaS Co",
    industry: "SaaS",
    priority: true,
    engagement_score: 100,
    stage: "Signalling",
    urgency: "Act this week",
    signals: [
      {
        label: "Executive Change",
        strength: 5,
        detected_at: new Date().toISOString().slice(0, 10),
        summary: "Pacific SaaS Co has a new senior leader in a buying window",
        recommended_opening_line: "Saw that Pacific SaaS Co has a new senior leader in a buying window",
        requires_realtime_alert: true
      },
      {
        label: "Relevant Job Posting",
        strength: 4,
        detected_at: new Date().toISOString().slice(0, 10),
        summary: "Pacific SaaS Co is hiring for roles connected to pipeline growth",
        recommended_opening_line: "Saw that Pacific SaaS Co is hiring for roles connected to pipeline growth",
        requires_realtime_alert: true
      }
    ]
  }
];

function App() {
  const [result, setResult] = useState<ValidationResult>(initialResult);
  const [signals, setSignals] = useState<SignalAccount[]>(initialSignals);
  const [csvText, setCsvText] = useState("name,email,company,title,industry,province,employees\nAvery Chen,avery.chen@pacificsaas.ca,Pacific SaaS Co,VP Growth,SaaS,BC,180\nMarie Tremblay,marie@quebeccommerce.ca,Quebec Commerce Group,Founder,Ecommerce,QC,74\nOperations Inbox,info@fraservalleyfactory.invalid,Fraser Valley Manufacturing,Operations,Manufacturing,BC,420");
  const [tone, setTone] = useState("consultative");
  const [language, setLanguage] = useState("English");
  const [apiStatus, setApiStatus] = useState("Ready with demo data");
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseStatus>({
    configured: false,
    mode: "unknown",
    message: "Supabase status not checked yet"
  });
  const [brand, setBrand] = useState({ agency: "Northstar B2B", product: "PipelineAI", colour: "#2454ff" });

  const hotContacts = useMemo(() => result.contacts.filter((contact) => contact.temperature === "HOT"), [result.contacts]);
  const selectedOutreach = hotContacts[0]?.outreach;

  useEffect(() => {
    void checkSupabaseStatus();
  }, []);

  async function checkSupabaseStatus() {
    try {
      const response = await fetch(`${API_BASE}/api/supabase/status`);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      setSupabaseStatus(await response.json() as SupabaseStatus);
    } catch (error) {
      setSupabaseStatus({
        configured: false,
        mode: "api-unavailable",
        message: `Supabase status unavailable (${(error as Error).message})`
      });
    }
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  function parseCsvRows(text: string): Contact[] {
    const [headerLine, ...rows] = text.trim().split(/\r?\n/);
    const headers = headerLine.split(",").map((header) => header.trim());
    return rows.map((row) => {
      const values = row.split(",").map((value) => value.trim());
      return headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = values[index] ?? "";
        return acc;
      }, {}) as unknown as Contact;
    });
  }

  async function runValidation(event?: FormEvent) {
    event?.preventDefault();
    setApiStatus("Validating contacts...");
    const contacts = parseCsvRows(csvText);
    try {
      const payload = await postJson<ValidationResult>("/api/validate/contacts", {
        contacts,
        tone,
        language,
        icp: {
          industries: ["SaaS", "Ecommerce", "Professional Services", "Manufacturing"],
          provinces: ["BC", "AB", "ON", "QC"],
          min_employees: 20,
          max_employees: 500,
          tech_targets: ["HubSpot", "Salesforce", "Shopify", "Google Analytics"],
          title_keywords: ["Founder", "CEO", "CMO", "VP", "Director", "Head"]
        }
      });
      setResult(payload);
      setApiStatus("Live API result loaded");
    } catch (error) {
      setResult(initialResult);
      setApiStatus(`API unavailable, showing deterministic demo data (${(error as Error).message})`);
    }
  }

  async function scanTargetAccounts() {
    setApiStatus("Scanning buying signals...");
    try {
      const response = await postJson<{ accounts: SignalAccount[] }>("/api/signal/scan", {
        accounts: [
          { company: "Pacific SaaS Co", industry: "SaaS", priority: true },
          { company: "Quebec Commerce Group", industry: "Ecommerce", priority: true },
          { company: "Fraser Valley Manufacturing", industry: "Manufacturing", priority: false }
        ]
      });
      setSignals(response.accounts);
      setApiStatus("Signal scan completed");
    } catch (error) {
      setSignals(initialSignals);
      setApiStatus(`API unavailable, showing signal demo data (${(error as Error).message})`);
    }
  }

  return (
    <main>
      <section className="hero" style={{ "--brand": brand.colour } as React.CSSProperties}>
        <nav>
          <strong>{brand.product}</strong>
          <span>Validate</span>
          <span>Signal</span>
          <span>Agency</span>
          <span>Compliance</span>
        </nav>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">ReachIQ for Canadian SMBs and agencies</p>
            <h1>Smarter outreach. Faster pipeline.</h1>
            <p className="lede">
              Clean lists, detect buying intent, generate personal outreach, and manage white-label client programs from one platform.
            </p>
            <div className="actions">
              <button onClick={runValidation}>Run validation engine</button>
              <button className="secondary" onClick={scanTargetAccounts}>Scan target accounts</button>
            </div>
            <p className="status">{apiStatus}</p>
          </div>
          <div className="hero-card">
            <span>List health</span>
            <strong>{result.summary.list_health_score}%</strong>
            <p>{result.summary.hot} hot contacts ready for AI outreach at ${result.summary.estimated_ai_cost_usd.toFixed(5)} estimated AI cost.</p>
            <div className="data-status">
              <Badge tone={supabaseStatus.configured ? "green" : "amber"}>{supabaseStatus.mode}</Badge>
              <small>{supabaseStatus.message}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <Metric label="Uploaded" value={result.summary.uploaded_contacts} />
        <Metric label="Deliverable" value={result.summary.deliverable_contacts} />
        <Metric label="Invalid removed" value={result.summary.invalid_removed} />
        <Metric label="Hot leads" value={result.summary.hot} />
        <Metric label="Warm nurture" value={result.summary.warm} />
        <Metric label="Cold monitor" value={result.summary.cold} />
      </section>

      <section className="panel two-column">
        <div>
          <p className="eyebrow">Module 1 - ReachIQ Validate</p>
          <h2>CSV upload, validation, enrichment, scoring, and outreach generation</h2>
          <form onSubmit={runValidation}>
            <label htmlFor="csv">Paste a CSV list</label>
            <textarea id="csv" value={csvText} onChange={(event) => setCsvText(event.target.value)} rows={9} />
            <div className="form-row">
              <label>
                Tone
                <select value={tone} onChange={(event) => setTone(event.target.value)}>
                  <option value="peer-to-peer">Peer-to-peer</option>
                  <option value="consultative">Consultative</option>
                  <option value="direct">Direct</option>
                  <option value="warm">Warm</option>
                </select>
              </label>
              <label>
                Language
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option>English</option>
                  <option>French</option>
                </select>
              </label>
            </div>
            <button type="submit">Validate and score list</button>
          </form>
        </div>
        <div className="stack">
          <Feature title="Six validation checks" items={["Syntax", "Domain/MX", "Mailbox", "Catch-all", "Disposable", "Role-based"]} />
          <Feature title="ICP builder" items={["Industries", "Company size", "Province", "Tech stack", "Title keywords", "Negative filters"]} />
          <Feature title="Export hub" items={result.exports.crm_targets} />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Campaign dashboard</p>
            <h2>Validated contacts</h2>
          </div>
          <button className="secondary" onClick={() => navigator.clipboard?.writeText(result.exports.clean_csv)}>Copy clean CSV</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Validation</th>
                <th>Score</th>
                <th>ICP fit</th>
                <th>Segment</th>
                <th>Compliance</th>
              </tr>
            </thead>
            <tbody>
              {result.contacts.map((contact) => (
                <tr key={`${contact.email}-${contact.company}`}>
                  <td>
                    <strong>{contact.name}</strong>
                    <span>{contact.title} - {contact.company}</span>
                  </td>
                  <td>
                    <Badge tone={contact.validation_status === "Valid" ? "green" : contact.validation_status === "Risky" ? "amber" : "red"}>
                      {contact.validation_status}
                    </Badge>
                    <small>{contact.validation_reasons?.join(", ")}</small>
                  </td>
                  <td>{contact.score ?? 0}</td>
                  <td>{contact.icp_fit_score ?? 0}%</td>
                  <td><Badge tone={contact.temperature === "HOT" ? "red" : contact.temperature === "WARM" ? "amber" : "blue"}>{contact.temperature}</Badge></td>
                  <td>{contact.compliance?.can_email ? "Can email" : "Review"} - {contact.compliance?.flags[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedOutreach && (
        <section className="panel two-column accent">
          <div>
            <p className="eyebrow">AI email engine</p>
            <h2>Personalised email for {hotContacts[0].company}</h2>
            <div className="subject-list">
              {selectedOutreach.subject_lines.map((subject) => <span key={subject}>{subject}</span>)}
            </div>
            <p className="email-body">{selectedOutreach.body}</p>
          </div>
          <div>
            <h3>Personalisation preview</h3>
            <p><strong>Trigger:</strong> {selectedOutreach.personalisation_trigger}</p>
            <p>{selectedOutreach.why_this_trigger}</p>
            <h3>Sequence builder</h3>
            <ol>
              <li>Email 1: generated intro</li>
              {selectedOutreach.follow_up_sequence.map((step) => <li key={step}>{step}</li>)}
              <li>LinkedIn DM reminder and reply-detection pause</li>
            </ol>
          </div>
        </section>
      )}

      <section className="panel two-column">
        <div>
          <p className="eyebrow">Module 2 - ReachIQ Signal</p>
          <h2>Buying intent monitor and trigger-based outreach automation</h2>
          <p>
            Monitor target accounts across funding, hiring, competitor research, leadership posts, news, tech changes, events, and executive moves.
          </p>
          <button onClick={scanTargetAccounts}>Refresh signal intelligence</button>
        </div>
        <div className="signal-list">
          {signals.map((account) => (
            <article className="signal-card" key={account.company}>
              <div>
                <strong>{account.company}</strong>
                <Badge tone={account.urgency === "Act this week" ? "red" : "blue"}>{account.urgency}</Badge>
              </div>
              <p>{account.stage} - Engagement score {account.engagement_score}</p>
              {account.signals.map((signal) => (
                <div className="timeline" key={`${account.company}-${signal.label}`}>
                  <span>{signal.detected_at}</span>
                  <p><strong>{signal.label}</strong>: {signal.summary}</p>
                  <small>{signal.recommended_opening_line}</small>
                </div>
              ))}
            </article>
          ))}
        </div>
      </section>

      <section className="panel two-column">
        <div>
          <p className="eyebrow">Module 3 - ReachIQ Agency</p>
          <h2>White-label infrastructure for agency partners</h2>
          <div className="form-row">
            <label>
              Agency
              <input value={brand.agency} onChange={(event) => setBrand({ ...brand, agency: event.target.value })} />
            </label>
            <label>
              Product name
              <input value={brand.product} onChange={(event) => setBrand({ ...brand, product: event.target.value })} />
            </label>
            <label>
              Primary colour
              <input type="color" value={brand.colour} onChange={(event) => setBrand({ ...brand, colour: event.target.value })} />
            </label>
          </div>
          <p className="white-label-preview" style={{ borderColor: brand.colour }}>
            Client-facing preview: <strong>{brand.product}</strong> by {brand.agency}. ReachIQ attribution hidden.
          </p>
        </div>
        <div className="agency-grid">
          {[
            ["Active clients", "3"],
            ["Contacts validated", "1,466"],
            ["Signals detected", "26"],
            ["Meetings booked", "13"],
            ["Billable usage", "$4,280 CAD"],
            ["Sequence templates", "4"]
          ].map(([label, value]) => <Metric key={label} label={label} value={value} compact />)}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Platform-wide features</p>
            <h2>Integrations, analytics, reporting, permissions, and compliance</h2>
          </div>
        </div>
        <div className="feature-grid">
          <Feature title="Supabase data API" items={["Credential status endpoint", "Generic table select", "Insert and upsert through PostgREST", "Persist validation runs", "Contacts table persistence"]} />
          <Feature title="Integrations hub" items={["HubSpot bi-directional sync", "Salesforce export", "Lemlist and Instantly campaigns", "Mailchimp nurture", "Slack alerts", "Zapier/Make webhooks", "Google Sheets sync"]} />
          <Feature title="Analytics dashboard" items={["Open/reply/bounce rates", "Pipeline influence", "Signal ROI", "List health trend", "AI tone performance", "PDF and CSV exports"]} />
          <Feature title="Compliance centre" items={["CASL consent", "PIPEDA data rights", "Quebec Law 25 flags", "GDPR notices", "Do-not-contact suppression", "Retention policies", "Audit log"]} />
          <Feature title="Roles and permissions" items={["Solo SMB", "Team Member own-contact view", "Team Admin settings", "Agency Super Admin all-client view"]} />
        </div>
        <button className="secondary" onClick={checkSupabaseStatus}>Refresh Supabase status</button>
      </section>

      <section className="panel pricing">
        <p className="eyebrow">Pricing architecture</p>
        <h2>Packaged for SMBs and agencies</h2>
        <div className="pricing-grid">
          {[
            ["Validate Starter", "$199/mo", "1,000 contacts, full validation, AI outreach, 1 user"],
            ["Validate Growth", "$399/mo", "5,000 contacts, sequences, CRM sync, 3 users"],
            ["Signal Growth", "$399/mo", "200 monitored accounts, real-time alerts, 8 signals"],
            ["Agency White Label", "$1,500+/mo", "Custom domain, agency portal, unlimited clients"]
          ].map(([name, price, description]) => (
            <article key={name}>
              <h3>{name}</h3>
              <strong>{price}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return (
    <article className={compact ? "metric compact" : "metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "green" | "amber" | "red" | "blue" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Feature({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="feature-card">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

export default App;
