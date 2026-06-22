export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "owner" | "admin" | "member" | "viewer";

export type Tables = {
  users: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    timezone: string | null;
    created_at: string;
    updated_at: string;
  };
  organizations: {
    id: string;
    name: string;
    slug: string;
    owner_user_id: string;
    created_at: string;
    updated_at: string;
  };
  organization_members: {
    id: string;
    organization_id: string;
    user_id: string;
    role: AppRole;
    created_at: string;
  };
  companies: {
    id: string;
    organization_id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    employee_count: number | null;
    location: Json;
    created_at: string;
    updated_at: string;
  };
  contacts: {
    id: string;
    organization_id: string;
    company_id: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string;
    title: string | null;
    linkedin_url: string | null;
    status: "new" | "validated" | "enriched" | "rejected";
    created_at: string;
    updated_at: string;
  };
  uploads: {
    id: string;
    organization_id: string;
    uploaded_by: string;
    file_name: string;
    file_path: string;
    mime_type: string | null;
    row_count: number;
    status: "pending" | "processing" | "completed" | "failed";
    created_at: string;
  };
  validation_results: {
    id: string;
    organization_id: string;
    upload_id: string;
    contact_id: string | null;
    validation_status: "valid" | "risky" | "invalid";
    score: number;
    reasons: Json;
    validated_at: string;
  };
  enrichment_results: {
    id: string;
    organization_id: string;
    contact_id: string;
    provider: string;
    payload: Json;
    enriched_at: string;
  };
  signals: {
    id: string;
    organization_id: string;
    company_id: string | null;
    signal_type: string;
    strength: number;
    summary: string;
    source_url: string | null;
    metadata: Json;
    detected_at: string;
    created_at: string;
  };
  campaigns: {
    id: string;
    organization_id: string;
    name: string;
    module: "validate" | "signal" | "agency";
    status: "draft" | "active" | "paused" | "completed";
    created_by: string;
    config: Json;
    started_at: string | null;
    created_at: string;
    updated_at: string;
  };
  ai_emails: {
    id: string;
    organization_id: string;
    campaign_id: string | null;
    contact_id: string | null;
    subject: string;
    body: string;
    tone: string | null;
    language: string | null;
    model_name: string | null;
    status: "draft" | "queued" | "sent" | "failed";
    created_at: string;
    updated_at: string;
  };
  subscriptions: {
    id: string;
    organization_id: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    plan_code: string;
    status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
    seats_included: number;
    current_period_end: string | null;
    created_at: string;
    updated_at: string;
  };
  audit_logs: {
    id: string;
    organization_id: string;
    actor_user_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    payload: Json;
    created_at: string;
  };
};

export type TableName = keyof Tables;
