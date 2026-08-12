// Deterministic RFC-822/.eml parsing. Preserves the original source verbatim
// elsewhere; this module only extracts metadata and readable body text.
// Also accepts plain pasted email text (Outlook-style headers) as a fallback.

export type ParsedEmail = {
  subject: string;
  fromAddress: string;
  fromName: string;
  to: string[];
  cc: string[];
  sentAt: Date | null;
  bodyText: string;
};

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeRfc2047(input: string): string {
  return input.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, _charset, enc, data) => {
    try {
      if (enc.toUpperCase() === "B") return Buffer.from(data, "base64").toString("utf8");
      return decodeQuotedPrintable(data.replace(/_/g, " "));
    } catch {
      return data;
    }
  });
}

function unfoldHeaders(raw: string): Map<string, string> {
  const headerEnd = raw.search(/\r?\n\r?\n/);
  const headerBlock = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw;
  const lines = headerBlock.split(/\r?\n/);
  const headers = new Map<string, string>();
  let currentKey = "";
  for (const line of lines) {
    if (/^\s/.test(line) && currentKey) {
      headers.set(currentKey, (headers.get(currentKey) ?? "") + " " + line.trim());
    } else {
      const idx = line.indexOf(":");
      if (idx > 0) {
        currentKey = line.slice(0, idx).trim().toLowerCase();
        headers.set(currentKey, line.slice(idx + 1).trim());
      }
    }
  }
  return headers;
}

function parseAddress(value: string): { name: string; address: string } {
  const decoded = decodeRfc2047(value);
  const angled = decoded.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (angled) return { name: angled[1].trim(), address: angled[2].trim().toLowerCase() };
  const bare = decoded.match(/[\w.+-]+@[\w.-]+/);
  return { name: decoded.replace(bare?.[0] ?? "", "").replace(/[<>"]/g, "").trim(), address: (bare?.[0] ?? "").toLowerCase() };
}

function parseAddressList(value: string): string[] {
  return value
    .split(",")
    .map((part) => parseAddress(part).address)
    .filter(Boolean);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type MimePart = { contentType: string; encoding: string; body: string };

function splitMultipart(body: string, boundary: string): string[] {
  return body
    .split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?`))
    .map((p) => p.trim())
    .filter((p) => p && p !== "--");
}

function collectParts(raw: string, contentType: string, encoding: string, depth = 0): MimePart[] {
  if (depth > 5) return [];
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (contentType.toLowerCase().startsWith("multipart/") && boundaryMatch) {
    const headerEnd = raw.search(/\r?\n\r?\n/);
    const body = headerEnd >= 0 ? raw.slice(headerEnd) : raw;
    const parts: MimePart[] = [];
    for (const chunk of splitMultipart(body, boundaryMatch[1])) {
      const partHeaders = unfoldHeaders(chunk);
      const partType = partHeaders.get("content-type") ?? "text/plain";
      const partEnc = partHeaders.get("content-transfer-encoding") ?? "7bit";
      const partBodyStart = chunk.search(/\r?\n\r?\n/);
      const partBody = partBodyStart >= 0 ? chunk.slice(partBodyStart).trim() : "";
      if (partType.toLowerCase().startsWith("multipart/")) {
        parts.push(...collectParts(chunk, partType, partEnc, depth + 1));
      } else {
        parts.push({ contentType: partType, encoding: partEnc, body: partBody });
      }
    }
    return parts;
  }
  const headerEnd = raw.search(/\r?\n\r?\n/);
  return [{ contentType, encoding, body: headerEnd >= 0 ? raw.slice(headerEnd).trim() : "" }];
}

function decodeBody(part: MimePart): string {
  const enc = part.encoding.toLowerCase();
  let text = part.body;
  if (enc === "base64") {
    try {
      text = Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      /* keep raw */
    }
  } else if (enc === "quoted-printable") {
    text = decodeQuotedPrintable(text);
  }
  return text;
}

export function parseEml(raw: string): ParsedEmail {
  const headers = unfoldHeaders(raw);

  // Not an RFC-822 message? Fall back to pasted-text heuristics.
  if (!headers.has("from") && !headers.has("subject")) {
    return parsePastedEmail(raw);
  }

  const from = parseAddress(headers.get("from") ?? "");
  const contentType = headers.get("content-type") ?? "text/plain";
  const encoding = headers.get("content-transfer-encoding") ?? "7bit";
  const parts = collectParts(raw, contentType, encoding);

  const plain = parts.find((p) => p.contentType.toLowerCase().includes("text/plain"));
  const html = parts.find((p) => p.contentType.toLowerCase().includes("text/html"));
  const bodyText = plain ? decodeBody(plain).trim() : html ? stripHtml(decodeBody(html)) : "";

  const dateRaw = headers.get("date");
  const sentAt = dateRaw ? new Date(dateRaw) : null;

  return {
    subject: decodeRfc2047(headers.get("subject") ?? "").trim(),
    fromAddress: from.address,
    fromName: from.name,
    to: parseAddressList(headers.get("to") ?? ""),
    cc: parseAddressList(headers.get("cc") ?? ""),
    sentAt: sentAt && !isNaN(sentAt.getTime()) ? sentAt : null,
    bodyText,
  };
}

/** Handles "From: X / Sent: Y / To: Z / Subject: W" pasted email text. */
export function parsePastedEmail(text: string): ParsedEmail {
  const get = (label: string) => text.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";
  const from = parseAddress(get("From"));
  const dateRaw = get("Sent") || get("Date");
  const sentAt = dateRaw ? new Date(dateRaw) : null;
  const bodyStart = text.search(/^Subject:.*$/im);
  let body = text;
  if (bodyStart >= 0) {
    const afterSubject = text.indexOf("\n", bodyStart);
    body = afterSubject >= 0 ? text.slice(afterSubject + 1).trim() : "";
  }
  return {
    subject: get("Subject"),
    fromAddress: from.address,
    fromName: from.name || get("From"),
    to: get("To") ? parseAddressList(get("To")) : [],
    cc: get("Cc") ? parseAddressList(get("Cc")) : [],
    sentAt: sentAt && !isNaN(sentAt.getTime()) ? sentAt : null,
    bodyText: body,
  };
}
