// Server-Sent Events: pushes a "refresh" event to the browser whenever new
// notifications or messages arrive for the signed-in user, so open pages
// update without a manual reload. (src/components/LiveRefresh.tsx consumes it.)
import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const POLL_MS = 3000;
const MAX_LIFETIME_MS = 5 * 60 * 1000; // client auto-reconnects

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const userId = user.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let since = new Date();
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearTimeout(lifetime);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const timer = setInterval(async () => {
        if (closed) return;
        try {
          const [notifications, messages] = await Promise.all([
            prisma.notification.count({ where: { userId, createdAt: { gt: since } } }),
            prisma.chatMessage.count({
              where: {
                createdAt: { gt: since },
                senderId: { not: userId },
                conversation: { participants: { some: { userId } } },
              },
            }),
          ]);
          since = new Date();
          if (notifications + messages > 0) {
            controller.enqueue(encoder.encode(`event: refresh\ndata: ${notifications + messages}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          }
        } catch {
          close();
        }
      }, POLL_MS);

      const lifetime = setTimeout(close, MAX_LIFETIME_MS);
      req.signal.addEventListener("abort", close);
      controller.enqueue(encoder.encode(`: connected\n\n`));
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
