import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminPreviewUser } from "@/lib/auth/require-admin-preview";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTemplate(
  template: string,
  values: Record<string, string>,
) {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, key) => values[key] ?? "",
  );
}

function buildOrderSummaryHtml(values: {
  customerName: string;
  customerEmail: string;
  bookingNumber: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  setupAddress: string;
  setupCity: string;
  setupState: string;
  setupZip: string;
  itemSummary: string;
  subtotal: string;
  discountAmount: string;
  deliveryFee: string;
  taxAmount: string;
  totalAmount: string;
  depositAmount: string;
  balanceDue: string;
}) {
  const subtotalRaw =
    Number.parseFloat(
      values.subtotal || "0",
    ) || 0;

  const discountRaw =
    Number.parseFloat(
      values.discountAmount || "0",
    ) || 0;

  const netSubtotal = Math.max(
    0,
    subtotalRaw - discountRaw,
  ).toFixed(2);

  const discountDisplay =
    discountRaw > 0
      ? `-$${discountRaw.toFixed(2)}`
      : "$0.00";

  return `
    <section style="border:1px solid #e7ddd0; border-radius:14px; padding:16px; margin-bottom:16px; background:#fcfaf7;">
      <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#9a7a49; font-weight:700;">Order Summary</div>
      <div style="margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px; color:#4b4339;">
        <div><strong>Customer:</strong> ${values.customerName}</div>
        <div><strong>Email:</strong> ${values.customerEmail || "-"}</div>
        <div><strong>Booking:</strong> ${values.bookingNumber}</div>
        <div><strong>Event date:</strong> ${values.eventDate}</div>
        <div><strong>Time:</strong> ${values.eventStartTime || "-"} - ${values.eventEndTime || "-"}</div>
        <div style="grid-column:1 / -1;"><strong>Address:</strong> ${values.setupAddress}, ${values.setupCity} ${values.setupState} ${values.setupZip}</div>
      </div>
      <div style="margin-top:10px; font-size:13px; color:#3f382f;"><strong>Equipment:</strong> ${values.itemSummary || "-"}</div>
      <div style="margin-top:10px; border-top:1px solid #e7ddd0; padding-top:10px; display:grid; gap:4px; font-size:13px; color:#3f382f;">
        <div><strong>Discount:</strong> ${discountDisplay}</div>
        <div><strong>Subtotal:</strong> $${netSubtotal}</div>
        <div><strong>Delivery:</strong> $${values.deliveryFee}</div>
        <div><strong>Tax:</strong> $${values.taxAmount}</div>
        <div><strong>Total:</strong> $${values.totalAmount}</div>
        <div><strong>Deposit:</strong> $${values.depositAmount}</div>
        <div><strong>Balance due:</strong> $${values.balanceDue}</div>
      </div>
    </section>
  `;
}

function buildSignedContractHtml(payload: {
  contractId: string;
  status: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  renderedHtml: string;
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signed contract ${escapeHtml(
      payload.contractId.slice(0, 8),
    )}</title>
    <style>
      body { margin: 0; background: #f6f3ef; font-family: Arial, sans-serif; color: #201d1a; }
      .wrap { max-width: 900px; margin: 24px auto; background: #fff; border: 1px solid #e7ddd0; border-radius: 14px; overflow: hidden; }
      .head { padding: 16px 20px; background: #23313f; color: #fff; }
      .meta { padding: 12px 20px; border-bottom: 1px solid #eee5d9; font-size: 13px; color: #5f5448; display: grid; gap: 6px; }
      .content { padding: 20px; }
      .label { color: #9a7a49; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }

      @media print {
        body { background: #fff; }
        .wrap { margin: 0; border: 0; border-radius: 0; max-width: 100%; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="head">
        <div class="label">Bounce Party LA</div>
        <h2 style="margin:6px 0 0 0; font-size:24px;">Signed contract</h2>
      </div>

      <div class="meta">
        <div><strong>Status:</strong> ${escapeHtml(
          payload.status || "unknown",
        )}</div>
        <div><strong>Signer:</strong> ${escapeHtml(
          payload.signerName || "-",
        )}</div>
        <div><strong>Email:</strong> ${escapeHtml(
          payload.signerEmail || "-",
        )}</div>
        <div><strong>Signed at:</strong> ${escapeHtml(
          payload.signedAt || "-",
        )}</div>
      </div>

      <div class="content">${payload.renderedHtml}</div>
    </div>
  </body>
</html>`;
}

function buildSignatureFallbackBlock(params: {
  signatureImageDataUrl: string;
  manualSignature: string;
}) {
  if (
    !params.signatureImageDataUrl &&
    !params.manualSignature
  ) {
    return "";
  }

  const signatureMarkup =
    params.signatureImageDataUrl
      ? `<img src="${params.signatureImageDataUrl}" alt="Manual signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" />`
      : escapeHtml(params.manualSignature);

  return `<section style="margin-top:16px;border-top:1px solid #e7ddd0;padding-top:12px;"><div style="font-size:12px;color:#9a7a49;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Manual signature</div><div style="margin-top:8px;">${signatureMarkup}</div></section>`;
}

type ContractRecord = {
  id: string;
  booking_id: string;
  status: string;
  signer_name: string | null;
  signer_email: string | null;
  signed_at: string | null;
  rendered_html: string | null;
  pdf_url: string | null;
  signature_metadata: Record<string, unknown> | null;
  created_at?: string | null;
};

function normalizeContractRecord(
  source: Record<string, unknown>,
  bookingId: string,
): ContractRecord {
  return {
    id: String(source.id || ""),
    booking_id: String(
      source.booking_id || bookingId,
    ),
    status: String(source.status || ""),
    signer_name: source.signer_name
      ? String(source.signer_name)
      : null,
    signer_email: source.signer_email
      ? String(source.signer_email)
      : null,
    signed_at: source.signed_at
      ? String(source.signed_at)
      : null,
    rendered_html: source.rendered_html
      ? String(source.rendered_html)
      : null,
    pdf_url: source.pdf_url
      ? String(source.pdf_url)
      : null,
    signature_metadata:
      source.signature_metadata &&
      typeof source.signature_metadata === "object"
        ? (source.signature_metadata as Record<string, unknown>)
        : null,
    created_at: source.created_at
      ? String(source.created_at)
      : null,
  };
}

function pickPreferredContract(
  rows: ContractRecord[],
) {
  if (!rows.length) {
    return null;
  }

  const score = (
    row: ContractRecord,
  ) => {
    const status = String(
      row.status || "",
    ).toLowerCase();

    const hasSignedAt =
      Boolean(row.signed_at);

    const hasRendered =
      Boolean(
        String(
          row.rendered_html || "",
        ).trim(),
      );

    const meta =
      (row.signature_metadata ||
        {}) as {
        signatureImageDataUrl?: unknown;
        manualSignature?: unknown;
      };

    const hasSignature =
      Boolean(
        String(
          meta.signatureImageDataUrl ||
            "",
        ).trim() ||
          String(
            meta.manualSignature ||
              "",
          ).trim(),
      );

    if (
      status === "signed" &&
      hasSignedAt &&
      hasRendered &&
      hasSignature
    ) {
      return 100;
    }

    if (
      status === "signed" &&
      hasSignedAt
    ) {
      return 90;
    }

    if (status === "signed") {
      return 80;
    }

    if (hasSignedAt) {
      return 70;
    }

    if (status === "viewed") {
      return 40;
    }

    if (status === "sent") {
      return 30;
    }

    return 10;
  };

  return [...rows].sort(
    (a, b) => {
      const scoreDiff =
        score(b) - score(a);

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const aTime =
        Date.parse(
          String(
            a.signed_at ||
              a.created_at ||
              "",
          ),
        ) || 0;

      const bTime =
        Date.parse(
          String(
            b.signed_at ||
              b.created_at ||
              "",
          ),
        ) || 0;

      return bTime - aTime;
    },
  )[0];
}

async function buildPdfBufferFromHtml(
  html: string,
) {
  const { chromium } =
    await import("playwright");

  const browser =
    await chromium.launch({
      headless: true,
    });

  try {
    const page =
      await browser.newPage();

    await page.setContent(
      html,
      {
        waitUntil:
          "networkidle",
      },
    );

    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm",
      },
    });
  } finally {
    await browser.close();
  }
}

function htmlToPlainText(
  html: string,
) {
  return String(html || "")
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " ",
    )
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " ",
    )
    .replace(
      /<br\s*\/?>/gi,
      "\n",
    )
    .replace(
      /<\/p>/gi,
      "\n\n",
    )
    .replace(
      /<\/div>/gi,
      "\n",
    )
    .replace(
      /<\/li>/gi,
      "\n",
    )
    .replace(
      /<li\b[^>]*>/gi,
      "- ",
    )
    .replace(
      /<[^>]+>/g,
      " ",
    )
    .replace(
      /&nbsp;/gi,
      " ",
    )
    .replace(
      /&amp;/gi,
      "&",
    )
    .replace(
      /&lt;/gi,
      "<",
    )
    .replace(
      /&gt;/gi,
      ">",
    )
    .replace(
      /&quot;/gi,
      '"',
    )
    .replace(
      /&#39;/gi,
      "'",
    )
    .replace(
      /\r\n/g,
      "\n",
    )
    .replace(
      /[ \t]+\n/g,
      "\n",
    )
    .replace(
      /\n{3,}/g,
      "\n\n",
    )
    .trim();
}

async function buildPdfBufferFallback(
  params: {
    contractId: string;
    status: string;
    signerName: string;
    signerEmail: string;
    signedAt: string;
    renderedHtml: string;
    signatureImageDataUrl: string;
    manualSignature: string;
    brandName: string;
    logoUrl: string;
  },
) {
  const {
    PDFDocument,
    StandardFonts,
    rgb,
  } = await import("pdf-lib");

  const pdfDoc =
    await PDFDocument.create();

  const font =
    await pdfDoc.embedFont(
      StandardFonts.Helvetica,
    );

  const boldFont =
    await pdfDoc.embedFont(
      StandardFonts.HelveticaBold,
    );

  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = 42;
  const marginRight = 42;
  const marginTop = 36;
  const marginBottom = 44;

  const contentWidth =
    pageWidth -
    marginLeft -
    marginRight;

  const lineHeight = 14;

  let page =
    pdfDoc.addPage([
      pageWidth,
      pageHeight,
    ]);

  let y =
    pageHeight -
    marginTop;

  const ensureSpace = (
    neededHeight: number,
  ) => {
    if (
      y - neededHeight >=
      marginBottom
    ) {
      return;
    }

    page =
      pdfDoc.addPage([
        pageWidth,
        pageHeight,
      ]);

    y =
      pageHeight -
      marginTop;
  };

  const wrapText = (
    text: string,
    size = 10,
    maxWidth = contentWidth,
  ) => {
    const words =
      String(text || "")
        .split(/\s+/)
        .filter(Boolean);

    const lines: string[] =
      [];

    let current = "";

    for (const word of words) {
      const candidate =
        current
          ? `${current} ${word}`
          : word;

      const width =
        font.widthOfTextAtSize(
          candidate,
          size,
        );

      if (
        width <=
        maxWidth
      ) {
        current =
          candidate;
      } else {
        if (current) {
          lines.push(
            current,
          );
        }

        current = word;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines;
  };

  const drawTextLine = (
    text: string,
    options?: {
      size?: number;
      bold?: boolean;
      color?: [
        number,
        number,
        number,
      ];
      x?: number;
      maxWidth?: number;
      lineGap?: number;
    },
  ) => {
    const size =
      options?.size || 10;

    const bold =
      options?.bold ||
      false;

    const color =
      options?.color ||
      [
        0.12,
        0.11,
        0.1,
      ];

    const x =
      options?.x ??
      marginLeft;

    const maxWidth =
      options?.maxWidth ??
      contentWidth;

    const gap =
      options?.lineGap ??
      lineHeight;

    ensureSpace(gap);

    page.drawText(
      text,
      {
        x,
        y,
        size,
        font: bold
          ? boldFont
          : font,
        color: rgb(
          color[0],
          color[1],
          color[2],
        ),
        maxWidth,
        lineHeight:
          gap,
      },
    );

    y -= gap;
  };

  const drawParagraph = (
    text: string,
    size = 10,
    bold = false,
    color: [
      number,
      number,
      number,
    ] = [
      0.12,
      0.11,
      0.1,
    ],
  ) => {
    const lines =
      wrapText(
        text,
        size,
        contentWidth,
      );

    for (
      const line of lines
    ) {
      drawTextLine(
        line,
        {
          size,
          bold,
          color,
        },
      );
    }
  };

  const extractField = (
    label: string,
  ) => {
    const escaped =
      label.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

    const regex =
      new RegExp(
        `<strong>\\s*${escaped}\\s*:<\\/strong>\\s*([^<]+)`,
        "i",
      );

    const match =
      params.renderedHtml.match(
        regex,
      );

    return String(
      match?.[1] || "",
    )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();
  };

  const extractSummary =
    () => ({
      customer:
        extractField(
          "Customer",
        ),
      email:
        extractField(
          "Email",
        ),
      booking:
        extractField(
          "Booking",
        ),
      eventDate:
        extractField(
          "Event date",
        ),
      eventTime:
        extractField(
          "Time",
        ),
      address:
        extractField(
          "Address",
        ),
      equipment:
        extractField(
          "Equipment",
        ),
      subtotal:
        extractField(
          "Subtotal",
        ),
      discount:
        extractField(
          "Discount",
        ),
      delivery:
        extractField(
          "Delivery",
        ),
      tax:
        extractField(
          "Tax",
        ),
      total:
        extractField(
          "Total",
        ),
      deposit:
        extractField(
          "Deposit",
        ),
      balanceDue:
        extractField(
          "Balance due",
        ),
    });

  const summary =
    extractSummary();

  const parseLogoBytes =
    async () => {
      const source =
        String(
          params.logoUrl ||
            "",
        ).trim();

      if (!source) {
        return null;
      }

      if (
        source.startsWith(
          "data:image/",
        )
      ) {
        const encoded =
          source.split(
            ",",
          )[1] || "";

        return Buffer.from(
          encoded,
          "base64",
        );
      }

      try {
        const response =
          await fetch(
            source,
            {
              cache:
                "no-store",
            },
          );

        if (
          !response.ok
        ) {
          return null;
        }

        const bytes =
          await response.arrayBuffer();

        return Buffer.from(
          bytes,
        );
      } catch {
        return null;
      }
    };

  const logoBytes =
    await parseLogoBytes();

  let logoHeight = 0;

  if (logoBytes) {
    try {
      let image: any;

      try {
        image =
          await pdfDoc.embedPng(
            logoBytes,
          );
      } catch {
        image =
          await pdfDoc.embedJpg(
            logoBytes,
          );
      }

      const scale =
        Math.min(
          170 /
            image.width,
          52 /
            image.height,
          1,
        );

      const width =
        image.width *
        scale;

      const height =
        image.height *
        scale;

      ensureSpace(
        height + 8,
      );

      page.drawImage(
        image,
        {
          x: marginLeft,
          y:
            y -
            height,
          width,
          height,
        },
      );

      logoHeight =
        height;
    } catch {
      logoHeight = 0;
    }
  }

  const brandX =
    marginLeft +
    (logoHeight > 0
      ? 190
      : 0);

  const brandWidth =
    contentWidth -
    (brandX -
      marginLeft);

  const brandLabel =
    String(
      params.brandName ||
        "Bounce Party LA",
    ).trim() ||
    "Bounce Party LA";

  drawTextLine(
    brandLabel,
    {
      size: 11,
      bold: true,
      color: [
        0.15,
        0.2,
        0.25,
      ],
      x: brandX,
      maxWidth:
        brandWidth,
      lineGap: 13,
    },
  );

  drawTextLine(
    "Signed contract",
    {
      size: 18,
      bold: true,
      color: [
        0.09,
        0.09,
        0.08,
      ],
      x: brandX,
      maxWidth:
        brandWidth,
      lineGap: 20,
    },
  );

  drawTextLine(
    `Contract ID: ${params.contractId.slice(
      0,
      8,
    )}`,
    {
      size: 10,
      color: [
        0.3,
        0.28,
        0.24,
      ],
      x: brandX,
      maxWidth:
        brandWidth,
    },
  );

  drawTextLine(
    `Status: ${
      params.status ||
      "signed"
    }   |   Signed at: ${
      params.signedAt ||
      "-"
    }`,
    {
      size: 10,
      color: [
        0.3,
        0.28,
        0.24,
      ],
      x: brandX,
      maxWidth:
        brandWidth,
    },
  );

  if (
    logoHeight > 0
  ) {
    const topRowBottom =
      pageHeight -
      marginTop -
      logoHeight;

    if (
      y >
      topRowBottom -
        10
    ) {
      y =
        topRowBottom -
        10;
    }
  }

  y -= 8;

  ensureSpace(130);

  page.drawRectangle({
    x: marginLeft,
    y: y - 118,
    width:
      contentWidth,
    height: 118,
    color: rgb(
      0.985,
      0.975,
      0.95,
    ),
    borderColor: rgb(
      0.9,
      0.86,
      0.8,
    ),
    borderWidth: 1,
  });

  const labelColor: [
    number,
    number,
    number,
  ] = [
    0.25,
    0.22,
    0.18,
  ];

  const valueColor: [
    number,
    number,
    number,
  ] = [
    0.11,
    0.1,
    0.09,
  ];

  const leftX =
    marginLeft + 12;

  const rightX =
    marginLeft +
    contentWidth / 2 +
    4;

  const row1 =
    y - 18;

  const rowGap = 16;

  page.drawText(
    "Order Summary",
    {
      x: leftX,
      y: y - 12,
      size: 11,
      font: boldFont,
      color: rgb(
        0.33,
        0.26,
        0.16,
      ),
    },
  );

  const drawPair = (
    label: string,
    value: string,
    x: number,
    rowY: number,
  ) => {
    page.drawText(
      `${label}:`,
      {
        x,
        y: rowY,
        size: 9,
        font: boldFont,
        color: rgb(
          labelColor[0],
          labelColor[1],
          labelColor[2],
        ),
        maxWidth: 90,
      },
    );

    page.drawText(
      value || "-",
      {
        x: x + 58,
        y: rowY,
        size: 9,
        font,
        color: rgb(
          valueColor[0],
          valueColor[1],
          valueColor[2],
        ),
        maxWidth:
          contentWidth /
            2 -
          72,
      },
    );
  };

  drawPair(
    "Customer",
    summary.customer ||
      params.signerName ||
      "-",
    leftX,
    row1,
  );

  drawPair(
    "Booking",
    summary.booking ||
      params.contractId.slice(
        0,
        8,
      ),
    rightX,
    row1,
  );

  drawPair(
    "Email",
    summary.email ||
      params.signerEmail ||
      "-",
    leftX,
    row1 - rowGap,
  );

  drawPair(
    "Event",
    summary.eventDate ||
      "-",
    rightX,
    row1 - rowGap,
  );

  drawPair(
    "Time",
    summary.eventTime ||
      "-",
    leftX,
    row1 -
      rowGap * 2,
  );

  drawPair(
    "Total",
    summary.total ||
      "-",
    rightX,
    row1 -
      rowGap * 2,
  );

  drawPair(
    "Deposit",
    summary.deposit ||
      "-",
    leftX,
    row1 -
      rowGap * 3,
  );

  drawPair(
    "Balance",
    summary.balanceDue ||
      "-",
    rightX,
    row1 -
      rowGap * 3,
  );

  const addressLine =
    summary.address ||
    "-";

  page.drawText(
    "Address:",
    {
      x: leftX,
      y:
        row1 -
        rowGap * 4,
      size: 9,
      font: boldFont,
      color: rgb(
        labelColor[0],
        labelColor[1],
        labelColor[2],
      ),
    },
  );

  page.drawText(
    addressLine,
    {
      x: leftX + 58,
      y:
        row1 -
        rowGap * 4,
      size: 9,
      font,
      color: rgb(
        valueColor[0],
        valueColor[1],
        valueColor[2],
      ),
      maxWidth:
        contentWidth -
        84,
    },
  );

  y -= 132;

  drawTextLine(
    "Contract content",
    {
      size: 12,
      bold: true,
      color: [
        0.2,
        0.18,
        0.15,
      ],
    },
  );

  y -= 2;

  let plainText =
    htmlToPlainText(
      params.renderedHtml,
    ) ||
    "Contract content is unavailable.";

  plainText =
    plainText
      .replace(
        /Order Summary[\s\S]*?(?=RENTAL AGREEMENT|Rental Agreement|TERMS AND CONDITIONS)/i,
        "",
      )
      .trim();

  const paragraphs =
    plainText
      .split(/\n{2,}/)
      .map((item) =>
        item.trim(),
      )
      .filter(Boolean);

  for (
    const paragraph of paragraphs
  ) {
    drawParagraph(
      paragraph,
      10,
      false,
      [
        0.12,
        0.11,
        0.1,
      ],
    );

    y -= 6;
  }

  if (
    params.signatureImageDataUrl ||
    params.manualSignature
  ) {
    ensureSpace(130);

    y -= 4;

    drawTextLine(
      "Manual signature",
      {
        size: 12,
        bold: true,
        color: [
          0.2,
          0.18,
          0.15,
        ],
      },
    );

    y -= 4;

    if (
      params.signatureImageDataUrl.startsWith(
        "data:image/",
      )
    ) {
      const base64 =
        params.signatureImageDataUrl.split(
          ",",
        )[1] || "";

      const bytes =
        Uint8Array.from(
          Buffer.from(
            base64,
            "base64",
          ),
        );

      try {
        const image =
          await pdfDoc.embedPng(
            bytes,
          );

        const scale =
          Math.min(
            260 /
              image.width,
            90 /
              image.height,
            1,
          );

        const width =
          image.width *
          scale;

        const height =
          image.height *
          scale;

        ensureSpace(
          height + 14,
        );

        page.drawImage(
          image,
          {
            x: marginLeft,
            y:
              y -
              height,
            width,
            height,
          },
        );

        y -=
          height + 8;
      } catch {
        drawTextLine(
          "Signature image is unavailable.",
          {
            size: 10,
          },
        );
      }
    } else if (
      params.manualSignature
    ) {
      drawParagraph(
        params.manualSignature,
        10,
        false,
      );
    }
  }

  const bytes =
    await pdfDoc.save();

  return Buffer.from(
    bytes,
  );
}

function buildEmergencyPdfBuffer(
  lines: string[],
) {
  const safeLines =
    lines
      .map((line) =>
        String(line || "")
          .replace(
            /\\/g,
            "\\\\",
          )
          .replace(
            /\(/g,
            "\\(",
          )
          .replace(
            /\)/g,
            "\\)",
          )
          .slice(
            0,
            180,
          ),
      )
      .slice(0, 45);

  const content = [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    ...safeLines.map(
      (
        line,
        index,
      ) =>
        index === 0
          ? `(${line}) Tj`
          : `T* (${line}) Tj`,
    ),
    "ET",
  ].join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(
      content,
      "utf8",
    )} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];

  let pdf =
    "%PDF-1.4\n";

  const offsets = [0];

  for (
    const object of objects
  ) {
    offsets.push(
      Buffer.byteLength(
        pdf,
        "utf8",
      ),
    );

    pdf += object;
  }

  const xrefStart =
    Buffer.byteLength(
      pdf,
      "utf8",
    );

  pdf +=
    `xref\n0 ${
      objects.length + 1
    }\n`;

  pdf +=
    "0000000000 65535 f \n";

  for (
    let index = 1;
    index <=
    objects.length;
    index += 1
  ) {
    pdf += `${String(
      offsets[index],
    ).padStart(
      10,
      "0",
    )} 00000 n \n`;
  }

  pdf +=
    `trailer\n<< /Size ${
      objects.length + 1
    } /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(
    pdf,
    "utf8",
  );
}

export async function GET(
  request: Request,
  props: {
    params: Promise<{
      bookingId: string;
    }>;
  },
) {
  const params =
    await props.params;

  const bookingId =
    String(
      params.bookingId ||
        "",
    ).trim();

  if (!bookingId) {
    return NextResponse.json(
      {
        error:
          "Missing booking id.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    searchParams,
  } = new URL(
    request.url,
  );

  const downloadRequested =
    searchParams.get(
      "download",
    ) === "1";

  const previewRequested =
    searchParams.get(
      "preview",
    ) === "admin";

  const supabase =
    previewRequested
      ? (
          await requireAdminPreviewUser()
        ).supabase
      : await createClient();

  const {
    data: sessionData,
  } =
    await supabase.auth.getUser();

  const userId =
    sessionData.user?.id ||
    null;

  if (!userId) {
    return NextResponse.json(
      {
        error:
          "Unauthorized.",
      },
      {
        status: 401,
      },
    );
  }

  /*
   * Direct booking read is intentionally retained.
   *
   * For normal customers RLS restricts this to their own booking.
   * For completion-session access this may legitimately return no row;
   * the authoritative SECURITY DEFINER RPC below handles that path.
   */
  const {
    data: bookingData,
    error: bookingError,
  } = await supabase
    .from("bookings")
    .select(
      "id, customer_id",
    )
    .eq(
      "id",
      bookingId,
    )
    .maybeSingle();

  if (bookingError) {
    return NextResponse.json(
      {
        error:
          bookingError.message,
      },
      {
        status: 500,
      },
    );
  }

  let rpcBooking: unknown =
    null;

  let rpcContract: unknown =
    null;

  let rpcItems: unknown[] =
    [];

  if (!previewRequested) {
    const {
      data: rpcDetails,
      error: rpcError,
    } =
      await supabase.rpc(
        "get_my_booking_details",
        {
          p_booking_id:
            bookingId,
        },
      );

    if (
      !rpcError &&
      rpcDetails &&
      typeof rpcDetails ===
        "object"
    ) {
      const typedDetails =
        rpcDetails as {
          booking?: unknown;
          contract?: unknown;
          items?: unknown;
        };

      rpcBooking =
        typedDetails.booking ||
        null;

      rpcContract =
        typedDetails.contract ||
        null;

      rpcItems =
        Array.isArray(
          typedDetails.items,
        )
          ? typedDetails.items
          : [];
    }

    /*
     * This SECURITY DEFINER RPC is the customer-safe way to load
     * the preferred contract. Customers intentionally do not have
     * direct SELECT access to public.contracts.
     */
    const {
      data:
        rpcPreferredContract,
      error:
        rpcPreferredContractError,
    } =
      await supabase.rpc(
        "get_my_booking_preferred_contract",
        {
          p_booking_id:
            bookingId,
        },
      );

    if (
      !rpcPreferredContractError &&
      rpcPreferredContract &&
      typeof rpcPreferredContract ===
        "object"
    ) {
      rpcContract =
        rpcPreferredContract;
    }
  }

  let contract:
    | ContractRecord
    | null = null;

  if (
    rpcContract &&
    typeof rpcContract ===
      "object"
  ) {
    contract =
      normalizeContractRecord(
        rpcContract as Record<
          string,
          unknown
        >,
        bookingId,
      );
  }

  /*
   * Admin preview is allowed to read contracts directly because
   * requireAdminPreviewUser() has already authorized the request.
   *
   * Normal customer requests intentionally use the customer RPCs above.
   * Do not add a customer-side direct fallback SELECT from public.contracts.
   */
  if (previewRequested) {
    const {
      data: contractRows,
      error:
        contractRowsError,
    } = await supabase
      .from("contracts")
      .select(
        "id, booking_id, status, signer_name, signer_email, signed_at, rendered_html, pdf_url, signature_metadata, created_at",
      )
      .eq(
        "booking_id",
        bookingId,
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      )
      .limit(25);

    if (
      contractRowsError
    ) {
      return NextResponse.json(
        {
          error:
            contractRowsError.message,
        },
        {
          status: 500,
        },
      );
    }

    if (
      Array.isArray(
        contractRows,
      ) &&
      contractRows.length >
        0
    ) {
      const normalized =
        contractRows.map(
          (row) =>
            normalizeContractRecord(
              row as Record<
                string,
                unknown
              >,
              bookingId,
            ),
        );

      const combined =
        contract
          ? [
              contract,
              ...normalized,
            ]
          : normalized;

      const deduped =
        combined.filter(
          (
            row,
            index,
            allRows,
          ) =>
            allRows.findIndex(
              (
                candidate,
              ) =>
                candidate.id ===
                row.id,
            ) === index,
        );

      contract =
        pickPreferredContract(
          deduped,
        ) || contract;
    }

    if (
      !contract ||
      !contract.id
    ) {
      const {
        data:
          contractData,
        error:
          contractError,
      } = await supabase
        .from("contracts")
        .select(
          "id, booking_id, status, signer_name, signer_email, signed_at, rendered_html, pdf_url, signature_metadata, created_at",
        )
        .eq(
          "booking_id",
          bookingId,
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          },
        )
        .limit(1)
        .maybeSingle();

      if (contractError) {
        return NextResponse.json(
          {
            error:
              contractError.message,
          },
          {
            status: 500,
          },
        );
      }

      if (contractData) {
        contract =
          normalizeContractRecord(
            contractData as Record<
              string,
              unknown
            >,
            bookingId,
          );
      }
    }
  }

  if (
    !contract ||
    !contract.id
  ) {
    return NextResponse.json(
      {
        error:
          "Contract not found.",
      },
      {
        status: 404,
      },
    );
  }

  const normalizedStatus =
    String(
      contract.status ||
        "",
    )
      .trim()
      .toLowerCase();

  const isSignedContract =
    normalizedStatus ===
      "signed" ||
    Boolean(
      contract.signed_at,
    );

  if (!previewRequested) {
    const sessionEmail =
      String(
        sessionData.user
          ?.email || "",
      )
        .trim()
        .toLowerCase();

    const signerEmail =
      String(
        contract.signer_email ||
          "",
      )
        .trim()
        .toLowerCase();

    /*
     * Fast path #1:
     * session email matches the signer email returned by the
     * authorized contract RPC.
     */
    let hasAccess =
      Boolean(
        sessionEmail &&
          signerEmail &&
          sessionEmail ===
            signerEmail,
      );

    /*
     * Fast path #2:
     * get_my_booking_details returned the booking, which means its
     * SECURITY DEFINER ownership checks have already passed.
     */
    if (!hasAccess) {
      hasAccess =
        Boolean(
          rpcBooking,
        );
    }

    /*
     * Fast path #3:
     * normal customer profile -> customer_id -> booking ownership.
     *
     * This remains useful for ordinary linked customer accounts and
     * works under the existing profiles/bookings RLS policies.
     */
    if (
      !hasAccess &&
      bookingData
    ) {
      const {
        data:
          profileData,
        error:
          profileError,
      } = await supabase
        .from("profiles")
        .select(
          "customer_id",
        )
        .eq(
          "auth_user_id",
          userId,
        )
        .maybeSingle();

      if (profileError) {
        return NextResponse.json(
          {
            error:
              profileError.message,
          },
          {
            status: 500,
          },
        );
      }

      const customerId =
        String(
          (
            profileData as {
              customer_id?: string;
            } | null
          )
            ?.customer_id ||
            "",
        ).trim() ||
        null;

      hasAccess =
        Boolean(
          customerId &&
            (
              bookingData as {
                customer_id?:
                  | string
                  | null;
              }
            ).customer_id ===
              customerId,
        );
    }

    /*
     * Final authoritative access check.
     *
     * IMPORTANT:
     * Do not read public.booking_completion_sessions directly here.
     *
     * Its RLS intentionally prevents customer SELECT access.
     * get_my_booking_authoritative_state() is SECURITY DEFINER and
     * centrally checks:
     *   - linked profile/customer ownership
     *   - customers.auth_user_id
     *   - signed contract email
     *   - active booking completion session email
     */
    if (!hasAccess) {
      const {
        data:
          authoritativeState,
        error:
          authoritativeStateError,
      } = await supabase.rpc(
        "get_my_booking_authoritative_state",
        {
          p_booking_id:
            bookingId,
        },
      );

      if (
        authoritativeStateError
      ) {
        console.error(
          "Customer contract authoritative access check failed:",
          {
            bookingId,
            userId,
            message:
              authoritativeStateError.message,
            code:
              authoritativeStateError.code,
          },
        );
      } else {
        hasAccess =
          Boolean(
            authoritativeState &&
              typeof authoritativeState ===
                "object",
          );
      }
    }

    if (!hasAccess) {
      return NextResponse.json(
        {
          error:
            "Booking not found.",
        },
        {
          status: 404,
        },
      );
    }
  }

  if (contract.pdf_url) {
    return NextResponse.redirect(
      contract.pdf_url,
      302,
    );
  }

  if (
    downloadRequested &&
    !isSignedContract
  ) {
    return NextResponse.json(
      {
        error:
          "Signed contract is not available yet.",
      },
      {
        status: 409,
      },
    );
  }

  let receiptBrandName =
    "Bounce Party LA";

  let receiptLogoUrl = "";

  if (downloadRequested) {
    const {
      data:
        receiptSettings,
      error:
        receiptSettingsError,
    } = await supabase
      .from(
        "booking_receipt_design_settings",
      )
      .select(
        "brand_name, logo_url",
      )
      .limit(1)
      .maybeSingle();

    if (
      receiptSettingsError
    ) {
      console.warn(
        "Could not load booking receipt design settings for contract PDF.",
        {
          bookingId,
          message:
            receiptSettingsError.message,
          code:
            receiptSettingsError.code,
        },
      );
    }

    receiptBrandName =
      String(
        (
          receiptSettings as {
            brand_name?: string;
          } | null
        )?.brand_name ||
          "Bounce Party LA",
      ).trim() ||
      "Bounce Party LA";

    receiptLogoUrl =
      String(
        (
          receiptSettings as {
            logo_url?: string;
          } | null
        )?.logo_url ||
          "",
      ).trim();
  }

  const renderedHtml =
    String(
      contract.rendered_html ||
        "",
    ).trim();

  const signedAt =
    contract.signed_at
      ? new Date(
          String(
            contract.signed_at,
          ),
        ).toLocaleString(
          "en-US",
        )
      : "-";

  const signatureMetadata =
    (contract.signature_metadata ||
      {}) as {
      signatureImageDataUrl?:
        | string
        | null;
      manualSignature?:
        | string
        | null;
    };

  const signatureImageDataUrl =
    String(
      signatureMetadata.signatureImageDataUrl ||
        "",
    ).trim();

  const manualSignature =
    String(
      signatureMetadata.manualSignature ||
        "",
    ).trim();

  let safeRenderedHtml =
    renderedHtml;

  /*
   * Normally the signed contract RPC already returns rendered_html.
   * This fallback only attempts to reconstruct the document if an older
   * contract row does not contain rendered HTML.
   */
  if (!safeRenderedHtml) {
    const [
      settingsResult,
      bookingResult,
      itemsResult,
    ] =
      await Promise.all([
        supabase
          .from(
            "booking_contract_settings",
          )
          .select(
            "template_html, signature_label",
          )
          .limit(1)
          .maybeSingle(),

        supabase
          .from(
            "bookings",
          )
          .select(
            "id, booking_number, event_date, event_start_time, event_end_time, setup_address, setup_city, setup_state, setup_zip, subtotal, discount_amount, delivery_fee, tax_amount, total_amount, deposit_amount, balance_due",
          )
          .eq(
            "id",
            bookingId,
          )
          .maybeSingle(),

        supabase
          .from(
            "booking_items",
          )
          .select(
            "quantity, products(name)",
          )
          .eq(
            "booking_id",
            bookingId,
          ),
      ]);

    const booking =
      (bookingResult.data ||
        rpcBooking) as any;

    const items =
      (
        (itemsResult.data ||
          []) as any[]
      ).length
        ? ((itemsResult.data ||
            []) as any[])
        : (rpcItems as any[]);

    if (booking) {
      const itemSummary =
        items
          .map(
            (
              item: any,
            ) => {
              const product =
                Array.isArray(
                  item.products,
                )
                  ? item
                      .products[0] ||
                    null
                  : item.products;

              const itemName =
                product?.name ||
                item.product_name ||
                "Product";

              return `${escapeHtml(
                itemName,
              )} × ${Number(
                item.quantity ||
                  1,
              )}`;
            },
          )
          .join(", ");

      const values: Record<
        string,
        string
      > = {
        customer_name:
          escapeHtml(
            String(
              contract.signer_name ||
                "Customer",
            ),
          ),

        customer_email:
          escapeHtml(
            String(
              contract.signer_email ||
                "",
            ),
          ),

        booking_number:
          escapeHtml(
            String(
              booking.booking_number ||
                booking.id ||
                bookingId,
            ),
          ),

        event_date:
          escapeHtml(
            String(
              booking.event_date ||
                "",
            ),
          ),

        event_start_time:
          escapeHtml(
            String(
              booking.event_start_time ||
                "",
            ),
          ),

        event_end_time:
          escapeHtml(
            String(
              booking.event_end_time ||
                "",
            ),
          ),

        setup_address:
          escapeHtml(
            String(
              booking.setup_address ||
                "",
            ),
          ),

        setup_city:
          escapeHtml(
            String(
              booking.setup_city ||
                "",
            ),
          ),

        setup_state:
          escapeHtml(
            String(
              booking.setup_state ||
                "",
            ),
          ),

        setup_zip:
          escapeHtml(
            String(
              booking.setup_zip ||
                "",
            ),
          ),

        items_summary:
          itemSummary,

        subtotal:
          Number(
            booking.subtotal ||
              0,
          ).toFixed(2),

        discount_amount:
          Number(
            booking.discount_amount ||
              0,
          ).toFixed(2),

        delivery_fee:
          Number(
            booking.delivery_fee ||
              0,
          ).toFixed(2),

        tax_amount:
          Number(
            booking.tax_amount ||
              0,
          ).toFixed(2),

        total_amount:
          Number(
            booking.total_amount ||
              0,
          ).toFixed(2),

        deposit_amount:
          Number(
            booking.deposit_amount ||
              0,
          ).toFixed(2),

        balance_due:
          Number(
            booking.balance_due ||
              0,
          ).toFixed(2),

        signature_label:
          escapeHtml(
            String(
              settingsResult
                .data
                ?.signature_label ||
                "Client signature",
            ),
          ),

        signature_name:
          escapeHtml(
            String(
              contract.signer_name ||
                "",
            ),
          ),

        signature_manual:
          signatureImageDataUrl
            ? `<img src="${signatureImageDataUrl}" alt="Manual signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" />`
            : escapeHtml(
                manualSignature ||
                  String(
                    contract.signer_name ||
                      "",
                  ),
              ),

        signature_date:
          contract.signed_at
            ? String(
                contract.signed_at,
              ).slice(0, 10)
            : new Date()
                .toISOString()
                .slice(
                  0,
                  10,
                ),
      };

      const defaultTemplate =
        "<h2>Rental Agreement</h2><p><strong>Customer:</strong> {{customer_name}}</p><p><strong>Booking:</strong> {{booking_number}}</p><p><strong>Event date:</strong> {{event_date}}</p><p><strong>Event time:</strong> {{event_start_time}} - {{event_end_time}}</p><p><strong>Address:</strong> {{setup_address}}, {{setup_city}}, {{setup_state}} {{setup_zip}}</p><p><strong>Equipment:</strong> {{items_summary}}</p><p><strong>Total:</strong> $ {{total_amount}}</p><p><strong>Deposit:</strong> $ {{deposit_amount}}</p><p><strong>{{signature_label}}:</strong> {{signature_manual}}</p><p><strong>Date:</strong> {{signature_date}}</p>";

      const template =
        String(
          settingsResult
            .data
            ?.template_html ||
            defaultTemplate,
        );

      const renderedTemplate =
        renderTemplate(
          template,
          values,
        );

      const orderSummaryBlock =
        buildOrderSummaryHtml(
          {
            customerName:
              values.customer_name,
            customerEmail:
              values.customer_email,
            bookingNumber:
              values.booking_number,
            eventDate:
              values.event_date,
            eventStartTime:
              values.event_start_time,
            eventEndTime:
              values.event_end_time,
            setupAddress:
              values.setup_address,
            setupCity:
              values.setup_city,
            setupState:
              values.setup_state,
            setupZip:
              values.setup_zip,
            itemSummary:
              values.items_summary,
            subtotal:
              values.subtotal,
            discountAmount:
              values.discount_amount,
            deliveryFee:
              values.delivery_fee,
            taxAmount:
              values.tax_amount,
            totalAmount:
              values.total_amount,
            depositAmount:
              values.deposit_amount,
            balanceDue:
              values.balance_due,
          },
        );

      safeRenderedHtml =
        `${orderSummaryBlock}${renderedTemplate}`;
    }
  }

  if (!safeRenderedHtml) {
    safeRenderedHtml = `
      <section style="border:1px solid #e7ddd0;border-radius:14px;padding:16px;background:#fcfaf7;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9a7a49;font-weight:700;">Signed contract</div>

        <h3 style="margin:8px 0 0 0;font-size:20px;color:#201d1a;">Booking ${escapeHtml(
          bookingId,
        )}</h3>

        <div style="margin-top:12px;font-size:13px;color:#4b4339;display:grid;gap:6px;">
          <div><strong>Status:</strong> ${escapeHtml(
            contract.status ||
              "signed",
          )}</div>

          <div><strong>Signer:</strong> ${escapeHtml(
            contract.signer_name ||
              "-",
          )}</div>

          <div><strong>Email:</strong> ${escapeHtml(
            contract.signer_email ||
              "-",
          )}</div>
        </div>
      </section>
    `;
  }

  const extractedSignatureImageDataUrl =
    (() => {
      const match =
        safeRenderedHtml.match(
          /<img[^>]+src=["'](data:image\/[^"']+)["'][^>]*>/i,
        );

      return String(
        match?.[1] || "",
      ).trim();
    })();

  const effectiveSignatureImageDataUrl =
    signatureImageDataUrl ||
    extractedSignatureImageDataUrl;

  const effectiveManualSignature =
    manualSignature ||
    String(
      contract.signer_name ||
        "",
    ).trim();

  const renderedHasSignature =
    safeRenderedHtml
      .toLowerCase()
      .includes(
        "manual signature",
      ) ||
    safeRenderedHtml
      .toLowerCase()
      .includes(
        '<img src="data:image',
      );

  const mergedRenderedHtml =
    renderedHasSignature
      ? safeRenderedHtml
      : `${safeRenderedHtml}${buildSignatureFallbackBlock(
          {
            signatureImageDataUrl:
              effectiveSignatureImageDataUrl,
            manualSignature:
              effectiveManualSignature,
          },
        )}`;

  const html =
    buildSignedContractHtml(
      {
        contractId:
          contract.id,
        status:
          contract.status,
        signerName:
          contract.signer_name ||
          "",
        signerEmail:
          contract.signer_email ||
          "",
        signedAt,
        renderedHtml:
          mergedRenderedHtml,
      },
    );

  if (downloadRequested) {
    let htmlPdfError:
      | unknown
      | null = null;

    try {
      const pdfBuffer =
        await buildPdfBufferFromHtml(
          html,
        );

      const pdfFilename =
        `signed-contract-${contract.id.slice(
          0,
          8,
        )}.pdf`;

      return new NextResponse(
        pdfBuffer as BodyInit,
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/pdf",
            "Content-Disposition":
              `attachment; filename=\"${pdfFilename}\"`,
            "Cache-Control":
              "no-store",
          },
        },
      );
    } catch (error) {
      htmlPdfError =
        error;

      try {
        const fallbackPdfBuffer =
          await buildPdfBufferFallback(
            {
              contractId:
                contract.id,
              status:
                contract.status,
              signerName:
                contract.signer_name ||
                "",
              signerEmail:
                contract.signer_email ||
                "",
              signedAt,
              renderedHtml:
                mergedRenderedHtml,
              signatureImageDataUrl:
                effectiveSignatureImageDataUrl,
              manualSignature:
                effectiveManualSignature,
              brandName:
                receiptBrandName,
              logoUrl:
                receiptLogoUrl,
            },
          );

        const fallbackPdfFilename =
          `signed-contract-${contract.id.slice(
            0,
            8,
          )}.pdf`;

        return new NextResponse(
          fallbackPdfBuffer as BodyInit,
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/pdf",
              "Content-Disposition":
                `attachment; filename=\"${fallbackPdfFilename}\"`,
              "Cache-Control":
                "no-store",
              "X-Contract-Download-Warning":
                `pdf_rendered_with_fallback:${encodeURIComponent(
                  String(
                    (
                      htmlPdfError as Error | null
                    )
                      ?.message ||
                      "html_pdf_failed",
                  ).slice(
                    0,
                    120,
                  ),
                )}`,
            },
          },
        );
      } catch (
        fallbackError
      ) {
        const emergencyPdf =
          buildEmergencyPdfBuffer(
            [
              "Signed contract",
              `Contract ID: ${contract.id.slice(
                0,
                8,
              )}`,
              `Status: ${
                contract.status ||
                "unknown"
              }`,
              `Signer: ${
                contract.signer_name ||
                "-"
              }`,
              `Email: ${
                contract.signer_email ||
                "-"
              }`,
              `Signed at: ${
                signedAt ||
                "-"
              }`,
              "",
              "PDF rendered with emergency fallback.",
              `HTML renderer: ${String(
                (
                  htmlPdfError as Error | null
                )
                  ?.message ||
                  "html_pdf_failed",
              ).slice(
                0,
                80,
              )}`,
              `PDF fallback: ${String(
                (
                  fallbackError as Error | null
                )
                  ?.message ||
                  "fallback_pdf_failed",
              ).slice(
                0,
                80,
              )}`,
              "Please contact support if layout is degraded.",
            ],
          );

        return new NextResponse(
          emergencyPdf as BodyInit,
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/pdf",
              "Content-Disposition":
                `attachment; filename=\"signed-contract-${contract.id.slice(
                  0,
                  8,
                )}.pdf\"`,
              "Cache-Control":
                "no-store",
              "X-Contract-Download-Warning":
                "pdf_rendered_with_emergency_fallback",
            },
          },
        );
      }
    }
  }

  const filename =
    `signed-contract-${contract.id.slice(
      0,
      8,
    )}.html`;

  return new NextResponse(
    html,
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/html; charset=utf-8",
        "Content-Disposition":
          `inline; filename=\"${filename}\"`,
        "Cache-Control":
          "no-store",
      },
    },
  );
}