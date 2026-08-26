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

  /**
   * The operator gets a sentence; whoever is diagnosing needs the actual fault.
   *
   * Without this the boundary swallowed the error completely, so every different cause -
   * a missing column, a null field, a shape the page did not expect - presented as the
   * same sentence with nothing behind it, and the only way to tell them apart was to
   * guess. React still reports the underlying error to the server console on the render
   * pass; this puts it where someone looking at the failing screen can reach it.
   */
  componentDidCatch(error: unknown) {
    console.error("[admin] section failed to render:", this.props.message, error);
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
