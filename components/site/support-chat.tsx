"use client";

import { useState } from "react";

export function SupportChat({ whatsappPhone }: { whatsappPhone: string }) {
  const [open, setOpen] = useState(false);
  const message = "Hello Sunspark, I have loved the electricals you are selling, I have a request to make.";
  const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;

  return <aside className="support-chat">
    {open ? (
      <div className="support-chat-panel">
        <div className="support-chat-head">
          <span>Support</span>
          <button aria-label="Close support chat" className="support-chat-close" onClick={() => setOpen(false)} type="button">×</button>
        </div>
        <strong>Sunspark Electrical and Solar</strong>
        <p>Ask about stock, cable sizes, quotations, invoices, delivery, or product combinations.</p>
        <small>{message}</small>
        <a className="primary-btn" href={whatsappUrl} rel="noreferrer" target="_blank">Chat on WhatsApp</a>
      </div>
    ) : null}
    <button className="support-chat-trigger" aria-label="Open Sunspark help" onClick={() => setOpen((value) => !value)} type="button">
      <span>?</span>
      <strong>Help</strong>
    </button>
  </aside>;
}
