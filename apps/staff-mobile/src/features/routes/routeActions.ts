import { supabase } from "../../lib/supabase";
import * as FileSystem from "expo-file-system/legacy";
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

export type MobileRouteStopProofPhoto = {
  id: string;
  photo_url: string | null;
  storage_path: string | null;
  caption: string | null;
  created_at: string | null;
};

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

type ListMyRouteStopProofPhotosInput = {
  stopId: string;
  bookingId: string;
};

type DeleteMyRouteStopProofPhotoInput = {
  stopId: string;
  bookingId: string;
  photoId: string;
  storagePath?: string | null;
};

const MAX_PROOF_PHOTO_BYTES = 4 * 1024 * 1024;

function safePhotoFileName(value: string) {
  const clean = String(value || "driver-proof.jpg")
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return clean || "driver-proof.jpg";
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

  const clean = base64.replace(/\s/g, "");

  if (clean.length % 4 !== 0) {
    throw new Error("Invalid image data.");
  }

  let outputLength = (clean.length / 4) * 3;

  if (clean.endsWith("==")) {
    outputLength -= 2;
  } else if (clean.endsWith("=")) {
    outputLength -= 1;
  }

  const output = new Uint8Array(outputLength);

  let outIndex = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const enc1 = chars.indexOf(clean[i]);
    const enc2 = chars.indexOf(clean[i + 1]);
    const enc3 = chars.indexOf(clean[i + 2]);
    const enc4 = chars.indexOf(clean[i + 3]);

    if (enc1 < 0 || enc2 < 0 || enc3 < 0 || enc4 < 0) {
      throw new Error("Invalid image data.");
    }

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    output[outIndex++] = chr1;

    if (enc3 !== 64 && outIndex < outputLength) {
      output[outIndex++] = chr2;
    }

    if (enc4 !== 64 && outIndex < outputLength) {
      output[outIndex++] = chr3;
    }
  }

  return output.buffer;
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

  const fileInfo = await FileSystem.getInfoAsync(uri);

  if (
    fileInfo.exists &&
    typeof fileInfo.size === "number" &&
    fileInfo.size > MAX_PROOF_PHOTO_BYTES
  ) {
    throw new Error(
      "Photo is too large. Please choose a smaller image (up to 4 MB).",
    );
  }

  const existingCountResult = await supabase
    .from("booking_photos")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("route_stop_id", stopId);

  if (existingCountResult.error) {
    throw new Error(existingCountResult.error.message);
  }

  const existingCount = Number(existingCountResult.count || 0);

  if (existingCount >= 3) {
    throw new Error("You can upload up to 3 proof photos per stop.");
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

  const base64 =
    await FileSystem.readAsStringAsync(uri, {
      encoding:
        FileSystem.EncodingType
          .Base64,
    });

  if (!base64) {
    throw new Error(
      "Could not read the selected photo.",
    );
  }

  const fileBytes =
    base64ToArrayBuffer(base64);

  if (fileBytes.byteLength > MAX_PROOF_PHOTO_BYTES) {
    throw new Error(
      "Photo is too large. Please choose a smaller image (up to 4 MB).",
    );
  }

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
    .upload(filePath, fileBytes, {
      cacheControl: "3600",
      upsert: false,
      contentType:
        mimeType ||
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

    const insertPayload: Record<string, unknown> = {
      booking_id: bookingId,
      route_stop_id: stopId,
      photo_type: photoType,
      photo_url: photoUrl,
      storage_path: filePath,
      caption:
        caption?.trim() ||
        `${
          stopType === "pickup"
            ? "Pickup"
            : "Delivery"
        } proof photo`,
      taken_by: "Driver",
      updated_at: new Date().toISOString(),
    };

    let insertResult = await supabase
      .from("booking_photos")
      .insert(insertPayload);

    if (
      insertResult.error &&
      /storage_path/i.test(
        String(insertResult.error.message || ""),
      )
    ) {
      const fallbackPayload = {
        ...insertPayload,
      };

      delete fallbackPayload.storage_path;

      insertResult = await supabase
        .from("booking_photos")
        .insert(fallbackPayload);
    }

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }

    const proofResult = await supabase.rpc(
      "sync_my_route_stop_proof_photo_status",
      {
        p_stop_id: stopId,
        p_booking_id: bookingId,
      },
    );

    if (proofResult.error) {
      throw new Error(proofResult.error.message);
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

export async function listMyRouteStopProofPhotos({
  stopId,
  bookingId,
}: ListMyRouteStopProofPhotosInput): Promise<MobileRouteStopProofPhoto[]> {
  if (!stopId || !bookingId) {
    return [];
  }

  const result = await supabase
    .from("booking_photos")
    .select("id, photo_url, storage_path, caption, created_at")
    .eq("booking_id", bookingId)
    .eq("route_stop_id", stopId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data || []) as MobileRouteStopProofPhoto[];
}

function inferStoragePathFromUrl(photoUrl: string | null | undefined) {
  const value = String(photoUrl || "");
  const marker = "/booking-photos/";
  const index = value.indexOf(marker);

  if (index < 0) {
    return "";
  }

  return value.slice(index + marker.length);
}

export async function deleteMyRouteStopProofPhoto({
  stopId,
  bookingId,
  photoId,
  storagePath,
}: DeleteMyRouteStopProofPhotoInput) {
  if (!stopId) {
    throw new Error("Missing route stop id.");
  }

  if (!bookingId) {
    throw new Error("Missing booking id.");
  }

  if (!photoId) {
    throw new Error("Missing proof photo id.");
  }

  const photoResult = await supabase
    .from("booking_photos")
    .select("id, photo_url, storage_path")
    .eq("id", photoId)
    .eq("booking_id", bookingId)
    .eq("route_stop_id", stopId)
    .maybeSingle();

  if (photoResult.error) {
    throw new Error(photoResult.error.message);
  }

  if (!photoResult.data) {
    throw new Error("Proof photo was not found.");
  }

  const deleteResult = await supabase
    .from("booking_photos")
    .delete()
    .eq("id", photoId)
    .eq("booking_id", bookingId)
    .eq("route_stop_id", stopId);

  if (deleteResult.error) {
    throw new Error(deleteResult.error.message);
  }

  const normalizedStoragePath =
    String(storagePath || "").trim() ||
    String(photoResult.data.storage_path || "").trim() ||
    inferStoragePathFromUrl(photoResult.data.photo_url);

  if (normalizedStoragePath) {
    try {
      await supabase.storage
        .from("booking-photos")
        .remove([normalizedStoragePath]);
    } catch {
      // Best-effort storage cleanup.
    }
  }

  const remainingCountResult = await supabase
    .from("booking_photos")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("route_stop_id", stopId);

  if (remainingCountResult.error) {
    throw new Error(remainingCountResult.error.message);
  }

  const remainingCount = Number(remainingCountResult.count || 0);

  if (remainingCount <= 0) {
    const proofResetResult = await supabase.rpc(
      "sync_my_route_stop_proof_photo_status",
      {
        p_stop_id: stopId,
        p_booking_id: bookingId,
      },
    );

    if (proofResetResult.error) {
      throw new Error(proofResetResult.error.message);
    }
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
