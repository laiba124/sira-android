import { fetchAllRows } from "./fetchAllRows";
import { supabase } from "./supabase";
import type { IncidentStatus, Severity, SiraIncident } from "../types/incident";

export type CreateIncidentPayload = {
  severity: Severity;
  title: string;
  description?: string | null;
  latitude: number;
  longitude: number;
  address_text?: string | null;
  city?: string | null;
  unit_name?: string | null;
  support_required?: string | null;
  reported_by_name?: string | null;
  reported_by_job_title?: string | null;
  reported_by_company?: string | null;
  reported_by_phone?: string | null;
  reporter_user_id?: string | null;
  stage?: "Threat" | "Action Plan";
  sub_stage?:
    | "Reported"
    | "Assessment"
    | "Avoidance Validation"
    | "Formulation"
    | "Implementation";
  action_plan?: string | null;
  threat_details?: string | null;
  action_plan_details?: string | null;
  photo_urls?: string[];
  status?: "open" | "in_progress" | "resolved";
};

const INCIDENT_SELECT = `
  id,
  incident_type,
  severity,
  title,
  description,
  latitude,
  longitude,
  address_text,
  city,
  unit_name,
  support_required,
  photo_urls,
  reported_by_name,
  reported_by_job_title,
  reported_by_company,
  reported_by_phone,
  reporter_user_id,
  stage,
  sub_stage,
  action_plan,
  threat_details,
  action_plan_details,
  status,
  created_at,
  updated_at
`;

export async function fetchIncidents() {
  // The id tiebreak keeps page boundaries stable when created_at values match.
  const { data, error } = await fetchAllRows((from, to) =>
    supabase
      .from("sira_incidents")
      .select(INCIDENT_SELECT)
      .eq("incident_type", "fiber_network_risk")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );

  if (error) throw error;
  return (data ?? []) as SiraIncident[];
}

export async function fetchIncidentById(id: string) {
  const { data, error } = await supabase
    .from("sira_incidents")
    .select(INCIDENT_SELECT)
    .eq("id", id)
    .eq("incident_type", "fiber_network_risk")
    .single();

  if (error) throw error;
  return data as SiraIncident;
}

export async function createIncident(payload: CreateIncidentPayload) {
  const photoUrls = payload.photo_urls ?? [];
  if (photoUrls.length > 2) {
    throw new Error("A Fiber Risk incident can contain a maximum of 2 pictures.");
  }

  const { data, error } = await supabase
    .from("sira_incidents")
    .insert({
      ...payload,
      incident_type: "fiber_network_risk",
      description: payload.description?.trim() || null,
      address_text: payload.address_text?.trim() || null,
      city: payload.city?.trim() || null,
      unit_name: payload.unit_name?.trim() || null,
      support_required: payload.support_required?.trim() || null,
      reported_by_name: payload.reported_by_name?.trim() || null,
      reported_by_job_title: payload.reported_by_job_title?.trim() || null,
      reported_by_company: payload.reported_by_company?.trim() || null,
      reported_by_phone: payload.reported_by_phone?.trim() || null,
      photo_urls: photoUrls,
      stage: payload.stage ?? "Threat",
      sub_stage: payload.sub_stage ?? "Reported",
      action_plan: payload.stage === "Action Plan" ? payload.action_plan?.trim() || null : null,
      threat_details: payload.threat_details?.trim() || null,
      action_plan_details: payload.action_plan_details?.trim() || null,
      status: payload.status ?? "open",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data as { id: string };
}

export async function updateIncidentStatus(
  id: string,
  status: Extract<IncidentStatus, "open" | "in_progress" | "resolved">
) {
  const { error } = await supabase
    .from("sira_incidents")
    .update({ status })
    .eq("id", id)
    .eq("incident_type", "fiber_network_risk");

  if (error) throw error;
}
