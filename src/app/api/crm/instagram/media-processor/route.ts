import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import {
  getInstagramMediaProcessorConfiguration,
  processInstagramMediaBatch,
} from "@/lib/crm/instagram-media-processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BATCH_SIZE = 15;
const MAX_BATCH_SIZE = 50;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(request: Request) {
  const config =
    getInstagramMediaProcessorConfiguration();

  if (!config.secret) {
    return false;
  }

  const authHeader =
    request.headers.get(
      "authorization",
    ) || "";

  const expected = `Bearer ${config.secret}`;
  const actualBuffer = Buffer.from(authHeader, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(
  request: Request,
) {
  const config =
    getInstagramMediaProcessorConfiguration();

  if (!config.enabled) {
    return NextResponse.json(
      {
        error:
          "Instagram media processor secret is not configured.",
      },
      { status: 503 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      { status: 401 },
    );
  }

  try {
    const body = await request
      .json()
      .catch(() => undefined);

    if (
      body !== undefined &&
      (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body. Expected a JSON object.",
        },
        { status: 400 },
      );
    }

    const requestBody =
      body as Record<string, unknown> | undefined;
    const candidateBatchSize =
      requestBody?.batchSize;
    const candidateMessageId =
      requestBody?.messageId;

    let messageId: string | undefined;

    if (candidateMessageId !== undefined) {
      if (
        typeof candidateMessageId !== "string" ||
        !UUID_PATTERN.test(candidateMessageId.trim())
      ) {
        return NextResponse.json(
          {
            error: "messageId must be a valid UUID.",
          },
          { status: 400 },
        );
      }

      messageId = candidateMessageId.trim();
    }

    let batchSize =
      messageId ? 1 : DEFAULT_BATCH_SIZE;

    if (candidateBatchSize !== undefined) {
      if (
        typeof candidateBatchSize !==
          "number" ||
        !Number.isFinite(
          candidateBatchSize,
        ) ||
        !Number.isInteger(
          candidateBatchSize,
        )
      ) {
        return NextResponse.json(
          {
            error:
              "batchSize must be a finite integer.",
          },
          { status: 400 },
        );
      }

      if (
        candidateBatchSize < 1 ||
        candidateBatchSize >
          MAX_BATCH_SIZE
      ) {
        return NextResponse.json(
          {
            error:
              `batchSize must be between 1 and ${MAX_BATCH_SIZE}.`,
          },
          { status: 400 },
        );
      }

      batchSize = candidateBatchSize;
    }

    if (messageId && batchSize !== 1) {
      return NextResponse.json(
        {
          error:
            "batchSize must be 1 when messageId is provided.",
        },
        { status: 400 },
      );
    }

    const result =
      await processInstagramMediaBatch({
        batchSize,
        messageId,
      });

    const runtimeConfig =
      getInstagramMediaProcessorConfiguration();

    return NextResponse.json({
      ok: true,
      batchSize,
      messageId,
      executionBudgetMs:
        runtimeConfig.executionBudgetMs,
      cleanupReserveMs:
        runtimeConfig.cleanupReserveMs,
      minMessageStartWindowMs:
        runtimeConfig.minMessageStartWindowMs,
      ...result,
    });
  } catch (error) {
    console.error(
      "Instagram media processor failed.",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Instagram media processor failed.",
      },
      { status: 500 },
    );
  }
}
