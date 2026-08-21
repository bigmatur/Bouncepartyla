"use client";

import { useEffect, useRef, useState } from "react";
import { signTemporaryBookingContractAction } from "./actions";

export default function CustomerContractSigner({
  bookingId,
  signerName,
  contractHtml,
  signatureLabel,
}: {
  bookingId: string;
  signerName: string;
  contractHtml: string;
  signatureLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [name, setName] = useState(signerName);
  const [accepted, setAccepted] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");

  function prepareCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(640, Math.floor(canvas.clientWidth || 640));
    const height = 210;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.lineWidth = 2.3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#23313f";
    return { canvas, context };
  }

  useEffect(() => {
    prepareCanvas();
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(p.x, p.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.stroke();
  }

  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSignatureDataUrl(canvas.toDataURL("image/png"));
  }

  function clear() {
    setSignatureDataUrl("");
    prepareCanvas();
  }

  return (
    <form action={signTemporaryBookingContractAction} className="space-y-5">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="signatureDataUrl" value={signatureDataUrl} />

      <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-black/10 bg-[#faf8f5] p-5 text-sm leading-6">
        <div dangerouslySetInnerHTML={{ __html: contractHtml }} />
      </div>

      <label className="block text-sm font-medium">
        Full legal name
        <input
          name="signerName"
          required
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 min-h-12 w-full rounded-xl border border-black/15 px-4 outline-none focus:border-black"
        />
      </label>

      <div>
        <div className="mb-2 text-sm font-medium">{signatureLabel}</div>
        <div className="rounded-2xl border border-black/15 bg-white p-3">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerLeave={finish}
            onPointerCancel={finish}
            className="h-[210px] w-full touch-none rounded-xl border border-black/10 bg-white"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-black/50">Use your finger or mouse to sign.</span>
            <button type="button" onClick={clear} className="rounded-full border border-black/10 px-4 py-2 text-xs font-semibold">
              Clear
            </button>
          </div>
        </div>
      </div>

      <label className="flex items-start gap-3 text-sm leading-5 text-black/65">
        <input name="accepted" type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>I have reviewed the complete rental agreement and agree to its terms.</span>
      </label>

      <button disabled={!accepted || !name.trim() || !signatureDataUrl} className="min-h-12 w-full rounded-xl bg-black px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
        Sign contract and continue to payment
      </button>
    </form>
  );
}
