"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signTemporaryBookingContractAction } from "./actions";
import {
  PRIVACY_POLICY_PATH,
  TERMS_OF_SERVICE_PATH,
} from "@/lib/legal/documents";

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
  const [noFacePaintAck, setNoFacePaintAck] = useState(false);
  const [adultSupervisionAck, setAdultSupervisionAck] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const contractPreviewRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const preview = contractPreviewRef.current;
    if (!preview) return;

    // The browser may restore a nested scroll position after navigation. Start
    // the preview at the agreement heading, matching the admin signing flow.
    const heading = Array.from(
      preview.querySelectorAll<HTMLElement>("h1, h2, h3, h4"),
    ).find((item) => /rental agreement|important terms/i.test(item.textContent || ""));

    preview.scrollTop = heading ? Math.max(0, heading.offsetTop - 12) : 0;
  }, [contractHtml]);

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
      <input type="hidden" name="noFacePaintAck" value={noFacePaintAck ? "true" : ""} />
      <input type="hidden" name="adultSupervisionAck" value={adultSupervisionAck ? "true" : ""} />

      <div ref={contractPreviewRef} className="max-h-[420px] overflow-y-auto rounded-2xl border border-[#e7dccd] bg-white p-5 text-sm leading-6 text-[#4b4339] ring-2 ring-[#e1d0b2]">
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

      <div className="space-y-2 rounded-2xl border border-[#d8cec0] bg-white px-3 py-2.5">
        <label className="flex items-start gap-2 text-sm font-semibold leading-5 text-[#1f1e1b]">
          <input
            type="checkbox"
            checked={noFacePaintAck}
            onChange={(event) => setNoFacePaintAck(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>No face paint, glitter, or silly string on equipment.</span>
        </label>

        <label className="flex items-start gap-2 text-sm font-semibold leading-5 text-[#1f1e1b]">
          <input
            type="checkbox"
            checked={adultSupervisionAck}
            onChange={(event) => setAdultSupervisionAck(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>Adult supervision is required at all times.</span>
        </label>

        <label className="flex items-start gap-2 text-sm font-semibold leading-5 text-[#1f1e1b]">
          <input
            name="accepted"
            type="checkbox"
            required
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>I have reviewed the complete rental agreement and agree to its terms.</span>
        </label>
      </div>

      <p className="rounded-xl bg-[#faf8f4] px-3 py-2 text-xs leading-5 text-[#6c6258] ring-1 ring-[#eee5d9]">
        Account and website use are also governed by our{" "}
        <Link href={TERMS_OF_SERVICE_PATH} className="font-semibold text-[#2b2a28] underline decoration-black/20 underline-offset-4">
          Terms of Service
        </Link>
        {" "}and{" "}
        <Link href={PRIVACY_POLICY_PATH} className="font-semibold text-[#2b2a28] underline decoration-black/20 underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>

      <button disabled={!noFacePaintAck || !adultSupervisionAck || !accepted || !name.trim() || !signatureDataUrl} className="min-h-12 w-full rounded-xl bg-black px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
        Sign contract and continue to payment
      </button>
    </form>
  );
}
