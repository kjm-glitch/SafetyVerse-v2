// Supabase Edge Function: Send Incident Report Email via Resend
// Deploy: supabase functions deploy send-incident-email --no-verify-jwt
// Set secret: supabase secrets set RESEND_API_KEY=re_xxxxx

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "safety@thesafetyverse.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const { recipients, subject, incident_summary, pdf_base64, pdf_filename } =
      await req.json();

    if (!recipients || recipients.length === 0) {
      throw new Error("No recipients provided");
    }

    // Build HTML email body
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1e293b; color: #f59e0b; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">Safety Incident Report</h1>
        </div>
        <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0;">
          <p style="color: #334155; margin: 0 0 16px;">A new incident report has been submitted. Details below:</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 12px; background: #e2e8f0; font-weight: bold; color: #334155; width: 40%;">Case #</td><td style="padding: 8px 12px; color: #334155;">${incident_summary.case_number || "N/A"}</td></tr>
            <tr><td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold; color: #334155;">Date</td><td style="padding: 8px 12px; color: #334155;">${incident_summary.incident_date || "N/A"}</td></tr>
            <tr><td style="padding: 8px 12px; background: #e2e8f0; font-weight: bold; color: #334155;">Time</td><td style="padding: 8px 12px; color: #334155;">${incident_summary.incident_time || "N/A"}</td></tr>
            <tr><td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold; color: #334155;">Site</td><td style="padding: 8px 12px; color: #334155;">${incident_summary.site_location || "N/A"}</td></tr>
            <tr><td style="padding: 8px 12px; background: #e2e8f0; font-weight: bold; color: #334155;">Injured Party</td><td style="padding: 8px 12px; color: #334155;">${incident_summary.injured_name || "No injury reported"}</td></tr>
            <tr><td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold; color: #334155;">Severity</td><td style="padding: 8px 12px; color: #334155;">${incident_summary.severity || "N/A"}</td></tr>
            <tr><td style="padding: 8px 12px; background: #e2e8f0; font-weight: bold; color: #334155;">Reported By</td><td style="padding: 8px 12px; color: #334155;">${incident_summary.reporting_party_name || "N/A"}</td></tr>
          </table>
          <div style="margin-top: 16px; padding: 12px; background: #fffbeb; border: 1px solid #f59e0b; border-radius: 6px; color: #92400e; font-size: 14px;">
            <strong>Description:</strong> ${(incident_summary.incident_description || "").substring(0, 500)}${(incident_summary.incident_description || "").length > 500 ? "..." : ""}
          </div>
        </div>
        <div style="background: #1e293b; color: #94a3b8; padding: 16px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px;">
          TheSafetyVerse &mdash; Automated Incident Notification
        </div>
      </div>
    `;

    // Build Resend payload
    const payload: Record<string, unknown> = {
      from: FROM_EMAIL,
      to: recipients,
      subject: subject || `Incident Report - Case #${incident_summary.case_number || "New"}`,
      html,
    };

    // Attach PDF if provided
    if (pdf_base64 && pdf_filename) {
      payload.attachments = [
        {
          filename: pdf_filename,
          content: pdf_base64,
        },
      ];
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const resData = await res.json();

    if (!res.ok) {
      throw new Error(resData.message || "Failed to send email");
    }

    return new Response(JSON.stringify({ success: true, id: resData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
