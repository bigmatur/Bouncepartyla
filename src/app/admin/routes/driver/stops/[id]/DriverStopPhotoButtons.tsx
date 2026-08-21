"use client";

import { uploadDriverStopPhotoAction } from "./actions";

export default function DriverStopPhotoButtons({
  stopId,
  bookingId,
  stopDate,
  driverName,
  stopType,
  mode,
}: {
  stopId: string;
  bookingId: string | null;
  stopDate: string | null;
  driverName: string | null;
  stopType: string | null;
  mode: "take" | "upload";
}) {
  return (
    <form action={uploadDriverStopPhotoAction}>
      <input type="hidden" name="stopId" value={stopId} />
      <input type="hidden" name="bookingId" value={bookingId || ""} />
      <input type="hidden" name="routeStopId" value={stopId} />
      <input type="hidden" name="photoType" value="general" />
      <input type="hidden" name="date" value={stopDate || ""} />
      <input type="hidden" name="takenBy" value={driverName || ""} />
      <input
        type="hidden"
        name="caption"
        value={stopType === "pickup" ? "Pickup proof from driver" : "Setup proof from driver"}
      />

      <label
        className={[
          "block cursor-pointer rounded-full px-5 py-3 text-center text-sm font-semibold",
          mode === "take"
            ? "bg-[#23313f] text-white"
            : "border border-[#d8cec0] bg-white text-[#23313f]",
        ].join(" ")}
      >
        {mode === "take" ? "Take photo" : "Upload photo"}
        <input
          type="file"
          name="photo"
          accept="image/*"
          capture={mode === "take" ? "environment" : undefined}
          required
          className="sr-only"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        />
      </label>
    </form>
  );
}
