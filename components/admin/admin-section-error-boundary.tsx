"use client";

import { Component, type ReactNode } from "react";

/**
 * Scopes a failed admin read to the section that needed it, so one dead call
 * does not take down a whole page.
 *
 * The point is what it replaces. These reads used to end in `.catch(() => [])`,
 * which renders an empty product picker or an empty document table -- visually
 * identical to "this shop has no products" and "you have no invoices". An
 * operator cannot tell a real empty state from an outage, so they act on the
 * wrong one: re-keying an item by hand, or re-issuing a document that already
 * exists. Saying the read failed is the safer answer.
 */
export class AdminSectionErrorBoundary extends Component<
  { children: ReactNode; message: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="admin-feedback error" role="alert">
          {this.props.message}
        </p>
      );
    }

    return this.props.children;
  }
}
