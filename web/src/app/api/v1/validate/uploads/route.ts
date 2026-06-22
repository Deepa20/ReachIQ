import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, apiErrorResponse, requireOrganizationMembership } from "@/lib/api/auth-context";
import { enrichContact, parseCsvContacts, runEmailValidation, scoreContact, type LeadTemperature, type ValidationStatus } from "@/lib/validate/pipeline";

const createUploadSchema = z.object({
  organizationId: z.string().uuid(),
  fileName: z.string().min(1),
  filePath: z.string().min(1),
  mimeType: z.string().optional(),
  rowCount: z.number().int().min(1),
});

const createCsvUploadSchema = z.object({
  organizationId: z.string().uuid(),
  file: z.instanceof(File),
});

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function createCompanyIfNeeded(
  supabase: Awaited<ReturnType<typeof requireOrganizationMembership>>["supabase"],
  organizationId: string,
  companyName: string,
  companyDomain: string | null,
  companyCache: Map<string, string>,
  industry: string,
  employeeCount: number,
): Promise<string | null> {
  if (!companyName) {
    return null;
  }

  const cacheKey = companyDomain || companyName.toLowerCase();
  if (companyCache.has(cacheKey)) {
    return companyCache.get(cacheKey) ?? null;
  }

  const payload = {
    organization_id: organizationId,
    name: companyName,
    domain: companyDomain,
    industry,
    employee_count: employeeCount,
    deleted_at: null,
  };

  const response = companyDomain
    ? await supabase.from("companies").upsert(payload, { onConflict: "organization_id,domain" }).select("id").single()
    : await supabase.from("companies").insert(payload).select("id").single();

  if (response.error) {
    throw new ApiError(500, response.error.message);
  }

  companyCache.set(cacheKey, response.data.id);
  return response.data.id;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      throw new ApiError(400, "organizationId is required");
    }

    const { supabase } = await requireOrganizationMembership(organizationId);

    const { data, error } = await supabase
      .from("uploads")
      .select("id,file_name,file_path,row_count,status,created_at")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const payload = createCsvUploadSchema.parse({
        organizationId: formData.get("organizationId"),
        file: formData.get("file"),
      });

      const { supabase, user } = await requireOrganizationMembership(payload.organizationId);
      const csvText = await payload.file.text();
      const parsedContacts = parseCsvContacts(csvText);

      if (!parsedContacts.length) {
        throw new ApiError(400, "CSV does not contain any valid contact rows with email");
      }

      const filePath = `${payload.organizationId}/uploads/${Date.now()}-${sanitizeFileName(payload.file.name || "contacts.csv")}`;
      const uploadFileResponse = await supabase.storage.from("uploads").upload(filePath, payload.file, {
        contentType: payload.file.type || "text/csv",
        upsert: false,
      });

      if (uploadFileResponse.error) {
        throw new ApiError(500, uploadFileResponse.error.message);
      }

      const { data: uploadRecord, error: uploadError } = await supabase
        .from("uploads")
        .insert({
          organization_id: payload.organizationId,
          uploaded_by: user.id,
          file_name: payload.file.name || "contacts.csv",
          file_path: filePath,
          mime_type: payload.file.type || "text/csv",
          row_count: parsedContacts.length,
          status: "processing",
          deleted_at: null,
        })
        .select("id,file_name,file_path,status,row_count")
        .single();

      if (uploadError) {
        throw new ApiError(500, uploadError.message);
      }

      const { data: existingCompanies, error: existingCompaniesError } = await supabase
        .from("companies")
        .select("id,name,domain")
        .eq("organization_id", payload.organizationId)
        .is("deleted_at", null);

      if (existingCompaniesError) {
        throw new ApiError(500, existingCompaniesError.message);
      }

      const companyCache = new Map<string, string>();
      for (const company of existingCompanies ?? []) {
        if (company.domain) {
          companyCache.set(company.domain.toLowerCase(), company.id);
        } else {
          companyCache.set(company.name.toLowerCase(), company.id);
        }
      }

      const processedContacts: Array<{
        contactId: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        company: string | null;
        title: string | null;
        validationStatus: ValidationStatus;
        score: number;
        temperature: LeadTemperature;
        reasons: string[];
      }> = [];

      for (const parsedContact of parsedContacts) {
        const validation = runEmailValidation(parsedContact.email);
        const enrichment = enrichContact(parsedContact);
        const scoring = scoreContact(parsedContact, validation, enrichment);

        const companyId = await createCompanyIfNeeded(
          supabase,
          payload.organizationId,
          enrichment.companyName,
          enrichment.companyDomain,
          companyCache,
          enrichment.industry,
          enrichment.employeeCount,
        );

        const contactPayload = {
          organization_id: payload.organizationId,
          company_id: companyId,
          first_name: parsedContact.firstName,
          last_name: parsedContact.lastName,
          email: parsedContact.email,
          title: parsedContact.title,
          linkedin_url: parsedContact.linkedinUrl,
          status: validation.status === "invalid" ? "rejected" : "enriched",
          metadata: {
            validationStatus: validation.status,
            reasons: validation.reasons,
            score: scoring.score,
            temperature: scoring.temperature,
          },
          deleted_at: null,
        };

        const { data: contact, error: contactError } = await supabase
          .from("contacts")
          .upsert(contactPayload, { onConflict: "organization_id,email" })
          .select("id,email,first_name,last_name,title")
          .single();

        if (contactError) {
          throw new ApiError(500, contactError.message);
        }

        const { error: validationInsertError } = await supabase.from("validation_results").insert({
          organization_id: payload.organizationId,
          upload_id: uploadRecord.id,
          contact_id: contact.id,
          validation_status: validation.status,
          score: scoring.score,
          reasons: validation.reasons,
          validated_at: new Date().toISOString(),
          deleted_at: null,
        });

        if (validationInsertError) {
          throw new ApiError(500, validationInsertError.message);
        }

        const { error: enrichmentInsertError } = await supabase.from("enrichment_results").upsert(
          {
            organization_id: payload.organizationId,
            contact_id: contact.id,
            provider: "reachiq-enrichment-v1",
            payload: {
              ...enrichment,
              score: scoring.score,
              temperature: scoring.temperature,
            },
            enriched_at: new Date().toISOString(),
            deleted_at: null,
          },
          {
            onConflict: "organization_id,contact_id,provider",
          },
        );

        if (enrichmentInsertError) {
          throw new ApiError(500, enrichmentInsertError.message);
        }

        processedContacts.push({
          contactId: contact.id,
          email: contact.email,
          firstName: contact.first_name,
          lastName: contact.last_name,
          company: enrichment.companyName,
          title: contact.title,
          validationStatus: validation.status,
          score: scoring.score,
          temperature: scoring.temperature,
          reasons: validation.reasons,
        });
      }

      const { error: updateUploadError } = await supabase
        .from("uploads")
        .update({
          status: "completed",
          row_count: processedContacts.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", uploadRecord.id);

      if (updateUploadError) {
        throw new ApiError(500, updateUploadError.message);
      }

      const summary = {
        total: processedContacts.length,
        valid: processedContacts.filter((contact) => contact.validationStatus === "valid").length,
        risky: processedContacts.filter((contact) => contact.validationStatus === "risky").length,
        invalid: processedContacts.filter((contact) => contact.validationStatus === "invalid").length,
        hot: processedContacts.filter((contact) => contact.temperature === "HOT").length,
        warm: processedContacts.filter((contact) => contact.temperature === "WARM").length,
        cold: processedContacts.filter((contact) => contact.temperature === "COLD").length,
      };

      return NextResponse.json({
        message: "CSV processed successfully",
        upload: uploadRecord,
        summary,
        contacts: processedContacts,
      });
    }

    const body = createUploadSchema.parse(await request.json());
    const { supabase, user } = await requireOrganizationMembership(body.organizationId);

    const { data, error } = await supabase
      .from("uploads")
      .insert({
        organization_id: body.organizationId,
        uploaded_by: user.id,
        file_name: body.fileName,
        file_path: body.filePath,
        mime_type: body.mimeType ?? null,
        row_count: body.rowCount,
        status: "pending",
        deleted_at: null,
      })
      .select("id,file_name,file_path,status")
      .single();

    if (error) {
      throw new ApiError(500, error.message);
    }

    return NextResponse.json({ message: "Upload created", item: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
