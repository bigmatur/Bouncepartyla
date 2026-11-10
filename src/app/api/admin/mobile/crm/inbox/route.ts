import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import { sendCrmConversationReply } from "@/lib/communication";
import { markCrmInstagramConversationSeen } from "@/lib/crm/instagram";

export const dynamic = "force-dynamic";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

async function context(request: Request, permission: "customers.view" | "customers.edit") {
  const authorization = String(request.headers.get("authorization") || "").trim();
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { error: fail(401, "Unauthorized") };
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) return { error: fail(500, "Server Supabase configuration is missing.") };
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const userResult = await supabase.auth.getUser(token);
  if (userResult.error || !userResult.data.user) return { error: fail(401, "Invalid or expired session.") };
  const access = await getUnifiedAccess(supabase);
  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can(permission)) {
    return { error: fail(403, "Your account cannot access CRM Inbox.") };
  }
  return { supabase, access };
}

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function messageName(message: any) {
  const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const username = String(metadata.username || metadata.sender_username || "").trim().replace(/^@+/, "");
  return username ? `@${username}` : String(message?.sender_identity || "").trim();
}

export async function GET(request: Request) {
  const result = await context(request, "customers.view");
  if ("error" in result) return result.error;
  const conversationId = String(new URL(request.url).searchParams.get("conversationId") || "").trim();

  if (conversationId) {
    const [conversationResult, messagesResult] = await Promise.all([
      result.supabase.from("crm_conversations").select("id,conversation_scope,subject,status,needs_reply,instagram_label,unread_count,last_channel,last_message_at,lead_id,customer_id,booking_id").eq("id", conversationId).maybeSingle(),
      result.supabase.from("crm_messages").select("id,conversation_id,direction,channel,sender_identity,body_text,metadata,sent_at,created_at,status").eq("conversation_id", conversationId).order("sent_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(500),
    ]);
    if (conversationResult.error) return fail(400, conversationResult.error.message);
    if (messagesResult.error) return fail(400, messagesResult.error.message);
    if (!conversationResult.data) return fail(404, "Conversation not found.");
    return NextResponse.json({ success: true, data: { conversation: conversationResult.data, messages: messagesResult.data || [] } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  const conversationsResult = await result.supabase
    .from("crm_conversations")
    .select("id,conversation_scope,subject,status,needs_reply,instagram_label,unread_count,last_channel,last_message_at,lead_id,customer_id,booking_id,created_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(250);
  if (conversationsResult.error) return fail(400, conversationsResult.error.message);
  const conversations = conversationsResult.data || [];
  const ids = conversations.map((conversation) => conversation.id);
  const leadIds = Array.from(new Set(conversations.map((conversation) => String(conversation.lead_id || "")).filter(Boolean)));
  const customerIds = Array.from(new Set(conversations.map((conversation) => String(conversation.customer_id || "")).filter(Boolean)));
  const [messagesResult, leadsResult, customersResult] = await Promise.all([
    ids.length ? result.supabase.from("crm_messages").select("conversation_id,direction,channel,sender_identity,body_text,metadata,sent_at,created_at").in("conversation_id", ids).order("sent_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1500) : Promise.resolve({ data: [], error: null }),
    leadIds.length ? result.supabase.from("booking_leads").select("id,customer_name,instagram_username").in("id", leadIds) : Promise.resolve({ data: [], error: null }),
    customerIds.length ? result.supabase.from("customers").select("id,full_name").in("id", customerIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const anyError = messagesResult.error || leadsResult.error || customersResult.error;
  if (anyError) return fail(400, anyError.message);
  const latestByConversation = new Map<string, any>();
  for (const message of messagesResult.data || []) if (!latestByConversation.has(String(message.conversation_id))) latestByConversation.set(String(message.conversation_id), message);
  const leadById = new Map((leadsResult.data || []).map((lead: any) => [String(lead.id), lead]));
  const customerById = new Map((customersResult.data || []).map((customer: any) => [String(customer.id), customer]));
  const data = conversations.map((conversation: any) => {
    const message = latestByConversation.get(String(conversation.id));
    const lead = leadById.get(String(conversation.lead_id || ""));
    const customer = customerById.get(String(conversation.customer_id || ""));
    const displayName = String(customer?.full_name || "").trim() || (lead?.instagram_username ? `@${String(lead.instagram_username).replace(/^@+/, "")}` : "") || String(lead?.customer_name || "").trim() || messageName(message) || String(conversation.subject || "").trim() || "Conversation";
    return { ...conversation, display_name: displayName, last_message: message?.body_text || "", last_message_direction: message?.direction || null };
  });
  return NextResponse.json({ success: true, data: { conversations: data } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: Request) {
  let body: { action?: unknown; conversationId?: unknown; body?: unknown } = {};
  try { body = await request.json(); } catch { return fail(400, "Invalid request body."); }
  const action = String(body.action || "").trim();
  const conversationId = String(body.conversationId || "").trim();
  if (!conversationId || !["read", "reply"].includes(action)) return fail(400, "Choose a CRM conversation action.");
  const result = await context(request, action === "reply" ? "customers.edit" : "customers.view");
  if ("error" in result) return result.error;
  const conversationResult = await result.supabase.from("crm_conversations").select("id,conversation_scope,last_channel").eq("id", conversationId).maybeSingle();
  if (conversationResult.error || !conversationResult.data) return fail(404, conversationResult.error?.message || "Conversation not found.");
  const scope = String(conversationResult.data.conversation_scope || "external").toLowerCase();

  if (action === "read") {
    if (scope === "staff_internal") {
      const readResult = await result.supabase.rpc("admin_mark_staff_support_conversation_read", { p_conversation_id: conversationId });
      if (readResult.error) return fail(400, readResult.error.message);
    } else {
      const update = await result.supabase.from("crm_conversations").update({ unread_count: 0, last_read_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", conversationId);
      if (update.error) return fail(400, update.error.message);
      if (String(conversationResult.data.last_channel || "").toLowerCase() === "instagram") await markCrmInstagramConversationSeen({ conversationId }).catch(() => undefined);
    }
    return NextResponse.json({ success: true });
  }

  const message = String(body.body || "").trim();
  if (!message) return fail(400, "Reply cannot be empty.");
  try {
    if (scope === "staff_internal") {
      const reply = await result.supabase.rpc("admin_reply_staff_support_conversation", { p_conversation_id: conversationId, p_body: message });
      if (reply.error) throw reply.error;
    } else if (scope === "internal") {
      const reply = await result.supabase.rpc("admin_reply_internal_conversation", { p_conversation_id: conversationId, p_client_message_id: randomUUID(), p_body: message, p_attachments: [] });
      if (reply.error) throw reply.error;
    } else {
      await sendCrmConversationReply({ conversationId, body: message });
    }
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : "Could not send reply.");
  }
  return NextResponse.json({ success: true });
}
