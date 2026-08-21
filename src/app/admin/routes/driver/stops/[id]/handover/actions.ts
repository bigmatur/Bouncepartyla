"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signDriverHandoverAction(formData: FormData) {
  const documentId = getString(formData, "documentId");
  const stopId = getString(formData, "stopId");
  const signerName = getString(formData, "signerName");
  const signatureDataUrl = getString(formData, "signatureDataUrl");
  const accepted = formData.get("accepted") === "on";

  if (!documentId) {
    throw new Error("Missing handover document id.");
  }

  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  if (!accepted) {
    throw new Error("Customer acknowledgement is required.");
  }

  if (!signerName) {
    throw new Error("Customer name is required.");
  }

  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(
      signatureDataUrl
    )
  ) {
    throw new Error("Customer signature is required.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "sign_handover_document",
    {
      p_document_id: documentId,
      p_signer_name: signerName,
      p_signature_image_data_url: signatureDataUrl,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const result =
    data && typeof data === "object"
      ? (data as any)
      : null;

  if (!result?.success) {
    throw new Error(
      result?.message || "Handover document could not be signed."
    );
  }

  revalidatePath(
    `/admin/routes/driver/stops/${stopId}`
  );

  revalidatePath(
    `/admin/routes/driver/stops/${stopId}/handover`
  );

  revalidatePath("/admin/handovers");

  redirect(
    `/admin/routes/driver/stops/${encodeURIComponent(
      stopId
    )}/handover?document=${encodeURIComponent(
      documentId
    )}&signed=1`
  );
}