import { NextResponse } from "next/server";

/**
 * Proxies a question to the contributor helper so Zoe can answer with the
 * requester's real context. The service token stays on the server.
 *
 * The helper is expected to answer with a server sent events stream or a
 * plain JSON body; both are handled here.
 */
export async function POST(request: Request) {
  const helperUrl = process.env.CONTRIBUTOR_HELPER_URL;
  const serviceToken = process.env.ZOE_SERVICE_TOKEN;

  if (!helperUrl || !serviceToken) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "Zoe is not configured for this deployment. Set CONTRIBUTOR_HELPER_URL and ZOE_SERVICE_TOKEN.",
      },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { status: "error", message: "A question is required." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${helperUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Zoe-Service-Token": serviceToken,
        "X-User-Authorization": auth,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "error",
          message: "Zoe could not answer that right now.",
        },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      return new NextResponse(response.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const payload = await response.json();
    const answer =
      payload?.answer ??
      payload?.data?.answer ??
      payload?.message ??
      payload?.data?.message ??
      "";

    return NextResponse.json({ status: "success", data: { answer } });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        message: "Zoe could not answer that right now.",
      },
      { status: 502 }
    );
  }
}
