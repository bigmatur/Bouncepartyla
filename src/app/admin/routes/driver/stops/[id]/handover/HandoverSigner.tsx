"use client";

import { useEffect, useRef, useState } from "react";
import { signDriverHandoverAction } from "./actions";

export default function HandoverSigner({
  documentId,
  stopId,
  signerName,
  acknowledgementLabel,
  signatureLabel,
}: {
  documentId: string;
  stopId: string;
  signerName: string;
  acknowledgementLabel: string;
  signatureLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const [name, setName] = useState(signerName);
  const [accepted, setAccepted] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");

  function prepareCanvas() {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(
      320,
      Math.floor(canvas.clientWidth || 640)
    );
    const height = 210;

    canvas.width = width * ratio;
    canvas.height = height * ratio;

    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    context.lineWidth = 2.3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#23313f";

    return {
      canvas,
      context,
    };
  }

  useEffect(() => {
    prepareCanvas();
  }, []);

  function point(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    const canvas = canvasRef.current!;

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function start(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    canvas.setPointerCapture(event.pointerId);

    const p = point(event);

    drawingRef.current = true;

    context.beginPath();
    context.moveTo(p.x, p.y);
  }

  function move(
    event: React.PointerEvent<HTMLCanvasElement>
  ) {
    if (!drawingRef.current) {
      return;
    }

    const context =
      canvasRef.current?.getContext("2d");

    if (!context) {
      return;
    }

    const p = point(event);

    context.lineTo(p.x, p.y);
    context.stroke();
  }

  function finish() {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    setSignatureDataUrl(
      canvas.toDataURL("image/png")
    );
  }

  function clear() {
    setSignatureDataUrl("");
    prepareCanvas();
  }

  return (
    <form
      action={signDriverHandoverAction}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="documentId"
        value={documentId}
      />

      <input
        type="hidden"
        name="stopId"
        value={stopId}
      />

      <input
        type="hidden"
        name="signatureDataUrl"
        value={signatureDataUrl}
      />

      <label className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#e4d7c8]">
        <input
          name="accepted"
          type="checkbox"
          required
          checked={accepted}
          onChange={(event) =>
            setAccepted(event.target.checked)
          }
          className="mt-1 h-5 w-5 shrink-0"
        />

        <span className="text-sm leading-6 text-[#4b4339]">
          {acknowledgementLabel}
        </span>
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
          Customer full name
        </span>

        <input
          name="signerName"
          required
          autoComplete="name"
          value={name}
          onChange={(event) =>
            setName(event.target.value)
          }
          className="mt-2 min-h-[48px] w-full rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />
      </label>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
          {signatureLabel}
        </div>

        <div className="rounded-[22px] border border-[#d8cec0] bg-white p-3">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerLeave={finish}
            onPointerCancel={finish}
            className="h-[210px] w-full touch-none rounded-xl border border-[#eee5d9] bg-white"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs leading-5 text-[#8b8177]">
              Use your finger or mouse to sign.
            </span>

            <button
              type="button"
              onClick={clear}
              className="shrink-0 rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#23313f]"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={
          !accepted ||
          !name.trim() ||
          !signatureDataUrl
        }
        className="min-h-[52px] w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Accept & sign handover
      </button>

      <p className="text-center text-xs leading-5 text-[#8b8177]">
        Signing this document confirms delivery and
        acceptance only. It does not modify the rental
        contract.
      </p>
    </form>
  );
}