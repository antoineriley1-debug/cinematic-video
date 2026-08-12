"use client";

// Subscribes to the SSE stream and refreshes the current server-rendered
// view when new notifications/messages arrive — real-time delivery without
// a websocket dependency. EventSource reconnects automatically.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const source = new EventSource("/api/stream");
    const onRefresh = () => router.refresh();
    source.addEventListener("refresh", onRefresh);
    return () => {
      source.removeEventListener("refresh", onRefresh);
      source.close();
    };
  }, [router]);
  return null;
}
