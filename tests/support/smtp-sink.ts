import { createServer, type Server, type Socket } from "node:net";

// Serveur SMTP minimal pour les tests : reçoit les messages du service sans rien envoyer à l'extérieur.
export type CapturedMail = { from: string; to: string[]; subject: string; text: string };

function decodeQuotedPrintable(value: string): string {
  return Buffer.from(value.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1").toString("utf8");
}

function decodeMimeWords(value: string): string {
  // RFC 2047 : l'espace entre deux mots encodés adjacents est ignoré.
  return value.replace(/\?=\s+=\?/g, "?==?").replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi, (_, kind: string, payload: string) =>
    kind.toUpperCase() === "B" ? Buffer.from(payload, "base64").toString("utf8") : decodeQuotedPrintable(payload.replace(/_/g, " ")));
}

function parseMessage(from: string, to: string[], raw: string): CapturedMail {
  const split = raw.indexOf("\r\n\r\n");
  const headerBlock = split === -1 ? raw : raw.slice(0, split);
  const body = split === -1 ? "" : raw.slice(split + 4);
  const headers = headerBlock.replace(/\r\n[ \t]+/g, " ");
  const header = (name: string) => headers.split("\r\n").find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))?.slice(name.length + 1).trim() ?? "";
  const encoding = header("Content-Transfer-Encoding").toLowerCase();
  const text = encoding === "base64" ? Buffer.from(body.replace(/\r?\n/g, ""), "base64").toString("utf8")
    : encoding === "quoted-printable" ? decodeQuotedPrintable(body)
    : body;
  return { from, to, subject: decodeMimeWords(header("Subject")), text: text.replace(/\r\n/g, "\n") };
}

/** Écoute sur `port` (0 : port libre). Les messages reçus s'accumulent dans `messages`. */
export async function startSmtpSink(port = 0): Promise<{ port: number; messages: CapturedMail[]; close: () => Promise<void> }> {
  const messages: CapturedMail[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    let buffer = "";
    let inData = false;
    let from = "";
    let to: string[] = [];
    socket.write("220 sink ESMTP\r\n");
    socket.on("error", () => undefined);
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          const raw = buffer.slice(0, end).replace(/\r\n\.\./g, "\r\n.");
          buffer = buffer.slice(end + 5);
          inData = false;
          messages.push(parseMessage(from, to, raw));
          socket.write("250 OK queued\r\n");
          continue;
        }
        const lineEnd = buffer.indexOf("\r\n");
        if (lineEnd === -1) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO")) socket.write("250-sink\r\n250 8BITMIME\r\n");
        else if (upper.startsWith("HELO")) socket.write("250 sink\r\n");
        else if (upper.startsWith("MAIL FROM")) { from = line.replace(/^MAIL FROM:\s*<?/i, "").replace(/>?(\s.*)?$/, ""); to = []; socket.write("250 OK\r\n"); }
        else if (upper.startsWith("RCPT TO")) { to.push(line.replace(/^RCPT TO:\s*<?/i, "").replace(/>?(\s.*)?$/, "")); socket.write("250 OK\r\n"); }
        else if (upper === "DATA") { inData = true; socket.write("354 go ahead\r\n"); }
        else if (upper === "QUIT") socket.end("221 bye\r\n");
        else if (upper === "RSET" || upper === "NOOP") socket.write("250 OK\r\n");
        else socket.write("502 not implemented\r\n");
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();
  const listening = typeof address === "object" && address ? address.port : port;
  return { port: listening, messages, close: () => new Promise<void>((resolve) => { server.close(() => resolve()); for (const socket of sockets) socket.destroy(); }) };
}
