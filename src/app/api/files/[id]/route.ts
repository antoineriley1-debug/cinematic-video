import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { readFileBuffer } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const result = await readFileBuffer(id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "content-type": result.file.mimeType,
      "content-disposition": `attachment; filename="${result.file.filename.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
    },
  });
}
