import "server-only";

import { Socket } from "node:net";
import { connect as tlsConnect, TLSSocket } from "node:tls";
import { siteConfig } from "@/lib/site-config";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SmtpSocket = Socket | TLSSocket;

export async function sendEmail({ to, subject, text, html }: SendEmailInput) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM ?? `${siteConfig.name} <${siteConfig.email}>`;

  if (!host || !user || !pass) {
    console.info(`[email disabled] ${subject} -> ${to}\n${text}`);
    return;
  }

  const message = buildEmailMessage({ from, to, subject, text, html });
  await sendSmtp({ host, port, user, pass, from: extractEmail(from), to, message });
}

/**
 * Strips anything that could end a header line.
 *
 * SMTP headers are separated by CRLF, so a newline surviving into a subject or an
 * address lets the caller append headers of their own - a Bcc to themselves being the
 * obvious one, which would quietly copy an entire customer mailing to an outsider.
 * Applied here, at the point the message is assembled, so every caller is covered
 * whether or not it remembered to validate.
 */
function headerValue(value: string) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function buildEmailMessage({ from, to, subject, text, html }: SendEmailInput & { from: string }) {
  const boundary = `sunspark-${Date.now().toString(36)}`;
  return [
    `From: ${headerValue(from)}`,
    `To: ${headerValue(to)}`,
    `Subject: ${headerValue(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

async function sendSmtp(input: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  message: string;
}) {
  let socket: SmtpSocket = await openSocket(input.host, input.port);
  let reader = createSmtpReader(socket);

  await reader.expect([220]);
  await command(socket, reader, `EHLO ${input.host}`, [250]);

  if (input.port !== 465) {
    await command(socket, reader, "STARTTLS", [220]);
    socket = tlsConnect({ socket, servername: input.host });
    reader = createSmtpReader(socket);
    await command(socket, reader, `EHLO ${input.host}`, [250]);
  }

  await command(socket, reader, "AUTH LOGIN", [334]);
  await command(socket, reader, Buffer.from(input.user).toString("base64"), [334]);
  await command(socket, reader, Buffer.from(input.pass).toString("base64"), [235]);
  await command(socket, reader, `MAIL FROM:<${input.from}>`, [250]);
  await command(socket, reader, `RCPT TO:<${input.to}>`, [250, 251]);
  await command(socket, reader, "DATA", [354]);
  await command(socket, reader, `${input.message.replace(/\r?\n\./g, "\r\n..")}\r\n.`, [250]);
  await command(socket, reader, "QUIT", [221]);
  socket.end();
}

function openSocket(host: string, port: number) {
  return new Promise<SmtpSocket>((resolve, reject) => {
    const socket = port === 465
      ? tlsConnect({ host, port, servername: host })
      : new Socket().connect(port, host);
    socket.once("connect", () => resolve(socket));
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
    socket.setTimeout(20000, () => reject(new Error("SMTP connection timed out")));
  });
}

function createSmtpReader(socket: SmtpSocket) {
  let buffer = "";
  const waiters: Array<(line: string) => void> = [];

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (/^\d{3} /.test(line)) {
        waiters.shift()?.(line);
      }
    }
  });

  return {
    expect(codes: number[]) {
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("SMTP response timed out")), 20000);
        waiters.push((line) => {
          clearTimeout(timer);
          const code = Number(line.slice(0, 3));
          if (!codes.includes(code)) {
            reject(new Error(`SMTP command failed with ${code}`));
            return;
          }
          resolve(line);
        });
      });
    }
  };
}

async function command(socket: SmtpSocket, reader: ReturnType<typeof createSmtpReader>, line: string, codes: number[]) {
  socket.write(`${line}\r\n`);
  return reader.expect(codes);
}

function extractEmail(value: string) {
  return value.match(/<([^>]+)>/)?.[1] ?? value;
}
