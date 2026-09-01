import { supabase } from "../../lib/supabase";
import type { MobileRouteStop } from "./driverRoutes";

export type MobileRouteStopStatus =
  | "on_the_way"
  | "arrived"
  | "installed"
  | "picked_up"
  | "completed";

export type MobilePaymentMethod =
  | "cash"
  | "zelle"
  | "venmo"
  | "card";

export type MobileChecklistField =
  | "installed"
  | "picked_up";

export function nextRouteAction(stop: MobileRouteStop): {
  label: string;
  status: MobileRouteStopStatus | null;
} {
  const status = String(stop.status || "").toLowerCase();
  const stopType = String(stop.stop_type || "").toLowerCase();

  if (["installed", "picked_up", "completed"].includes(status)) {
    return {
      label: "Completed",
      status: null,
    };
  }

  if (status === "on_the_way") {
    return {
      label: "Arrived",
      status: "arrived",
    };
  }

  if (status === "arrived") {
    return stopType === "pickup"
      ? {
          label: "Complete pickup",
          status: "picked_up",
        }
      : {
          label: "Complete delivery",
          status: "installed",
        };
  }

  return {
    label: "Start navigation",
    status: "on_the_way",
  };
}

export async function startMyDriverShift() {
  const result = await supabase.rpc("start_my_staff_time", {
    p_source: "driver_route",
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error(
      "Could not start the driver's work shift.",
    );
  }

  return String(result.data);
}

export async function startMyStaffBreak() {
  const result = await supabase.rpc(
    "start_my_staff_break",
  );

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error(
      "Could not start the work break.",
    );
  }

  return String(result.data);
}

export async function resumeMyStaffWork() {
  const result = await supabase.rpc(
    "resume_my_staff_work",
  );

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error(
      "Could not resume the work shift.",
    );
  }

  return String(result.data);
}

export async function finishMyDriverShift() {
  const result = await supabase.rpc(
    "finish_my_staff_time",
  );

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

export async function updateMyRouteStopStatus(
  stopId: string,
  status: MobileRouteStopStatus,
) {
  const result = await supabase.rpc(
    "update_my_route_stop_status",
    {
      p_stop_id: stopId,
      p_status: status,
    },
  );

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

export async function saveMyRouteStopNotes(
  stopId: string,
  notes: string,
) {
  const result = await supabase
    .from("route_stops")
    .update({
      driver_notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stopId);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function markMyRouteStopPaymentCollected(
  stopId: string,
  amount: number,
  method: MobilePaymentMethod,
) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      "Payment amount must be greater than zero.",
    );
  }

  const result = await supabase.rpc(
    "mark_my_route_stop_payment_collected",
    {
      p_stop_id: stopId,
      p_amount: amount,
      p_method: method,
    },
  );

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

type UploadMyRouteStopProofPhotoInput = {
  stopId: string;
  bookingId: string;
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  caption?: string | null;
};

function safePhotoFileName(value: string) {
  const clean = String(value || "driver-proof.jpg")
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || "driver-proof.jpg";
}

export async function uploadMyRouteStopProofPhoto({
  stopId,
  bookingId,
  uri,
  fileName,
  mimeType,
  caption,
}: UploadMyRouteStopProofPhotoInput) {
  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  if (!uri) {
    throw new Error("Missing photo.");
  }

  const stopResult = await supabase
    .from("route_stops")
    .select("id, stop_type")
    .eq("id", stopId)
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (stopResult.error) {
    throw new Error(stopResult.error.message);
  }

  if (!stopResult.data) {
    throw new Error(
      "The route stop could not be found.",
    );
  }

  const stopType = String(
    stopResult.data.stop_type || "",
  ).toLowerCase();

  const photoType =
    stopType === "pickup"
      ? "pickup"
      : "delivery_setup";

  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(
      "Could not read the selected photo.",
    );
  }

  const blob = await response.blob();

  const normalizedFileName = safePhotoFileName(
    fileName || `driver-proof-${Date.now()}.jpg`,
  );

  const filePath = [
    bookingId,
    "driver-stop",
    photoType,
    `${Date.now()}-${normalizedFileName}`,
  ].join("/");

  const uploadResult = await supabase.storage
    .from("booking-photos")
    .upload(filePath, blob, {
      cacheControl: "3600",
      upsert: false,
      contentType:
        mimeType ||
        blob.type ||
        "image/jpeg",
    });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message);
  }

  try {
    const publicUrlResult = supabase.storage
      .from("booking-photos")
      .getPublicUrl(filePath);

    const photoUrl =
      publicUrlResult.data.publicUrl;

    const registerResult = await supabase.rpc(
      "register_my_route_stop_proof_photo",
      {
        p_stop_id: stopId,
        p_booking_id: bookingId,
        p_photo_url: photoUrl,
        p_storage_path: filePath,
        p_caption:
          caption?.trim() ||
          `${
            stopType === "pickup"
              ? "Pickup"
              : "Delivery"
          } proof photo`,
      },
    );

    if (registerResult.error) {
      throw new Error(registerResult.error.message);
    }

    return {
      photoUrl,
      filePath,
    };
  } catch (error) {
    try {
      await supabase.storage
        .from("booking-photos")
        .remove([filePath]);
    } catch {
      // Best-effort cleanup only.
    }

    throw error;
  }
}

export async function toggleMyChecklistItem(
  checklistItemId: string,
  bookingId: string,
  field: MobileChecklistField,
  value: boolean,
) {
  if (!checklistItemId) {
    throw new Error(
      "Missing checklist item id.",
    );
  }

  if (!bookingId) {
    throw new Error(
      "Missing booking id.",
    );
  }

  const now = new Date().toISOString();

  const updateData: Record<string, unknown> = {
    [field]: value,
    updated_at: now,
  };

  if (field === "installed") {
    updateData.installed_at = value
      ? now
      : null;
  }

  if (field === "picked_up") {
    updateData.picked_up_at = value
      ? now
      : null;
  }

  const result = await supabase
    .from("booking_checklist_items")
    .update(updateData)
    .eq("id", checklistItemId)
    .eq("booking_id", bookingId);

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }
}

/**
 * Signs the existing Equipment Handover document.
 *
 * Uses the same database RPC as the web Driver Handover.
 * This does not modify the rental contract, booking payment,
 * Stripe state or route stop status.
 */
export async function signMyHandoverDocument(
  documentId: string,
  signerName: string,
  signatureDataUrl: string,
) {
  const cleanDocumentId =
    String(documentId || "").trim();

  const cleanSignerName =
    String(signerName || "").trim();

  const cleanSignature =
    String(signatureDataUrl || "").trim();

  if (!cleanDocumentId) {
    throw new Error(
      "Missing handover document id.",
    );
  }

  if (!cleanSignerName) {
    throw new Error(
      "Customer name is required.",
    );
  }

  if (
    !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(
      cleanSignature,
    )
  ) {
    throw new Error(
      "Customer signature is required.",
    );
  }

  const result = await supabase.rpc(
    "sign_handover_document",
    {
      p_document_id:
        cleanDocumentId,

      p_signer_name:
        cleanSignerName,

      p_signature_image_data_url:
        cleanSignature,
    },
  );

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  const data =
    result.data &&
    typeof result.data === "object"
      ? (result.data as {
          success?: boolean;
          status?: string;
          document_id?: string;
          signed_at?: string;
          message?: string;
        })
      : null;

  if (!data?.success) {
    throw new Error(
      data?.message ||
        "Handover document could not be signed.",
    );
  }

  return {
    status:
      String(
        data.status || "",
      ).trim() || "signed",

    documentId:
      String(
        data.document_id ||
          cleanDocumentId,
      ),

    signedAt:
      data.signed_at
        ? String(data.signed_at)
        : null,
  };
}