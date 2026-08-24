"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useRef, useState, type ReactNode } from "react";

/**
 * Product description editor.
 *
 * The extension set is deliberately narrowed to the tags sanitizeRichText
 * allows, so whatever an admin sees here is exactly what the storefront renders.
 * Anything outside that list (strike, code, code blocks, rules, h1/h4-h6) is
 * turned off rather than being silently stripped after saving.
 */
const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    strike: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https", "mailto", "tel"],
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" }
    }
  })
];

function ToolbarButton({
  active,
  children,
  disabled,
  label,
  onClick
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active ? true : undefined}
      className={active ? "is-active" : undefined}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const setLink = useCallback(() => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt("Link URL", previous ?? "https://");

    if (input === null) return;

    const url = input.trim();

    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    const href = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, [editor]);

  return (
    <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
      <div className="rich-text-toolbar-group">
        <ToolbarButton active={editor.isActive("bold")} label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("underline")} label="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <u>U</u>
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-group">
        <ToolbarButton active={editor.isActive("paragraph")} label="Normal text" onClick={() => editor.chain().focus().setParagraph().run()}>
          P
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          label="Heading"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 3 })}
          label="Subheading"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-group">
        <ToolbarButton active={editor.isActive("bulletList")} label="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          &bull;&#8203;&mdash;
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1.
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("blockquote")} label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          &ldquo;
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-group">
        <ToolbarButton active={editor.isActive("link")} label="Add or edit link" onClick={setLink}>
          Link
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor.isActive("link")}
          label="Remove link"
          onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
        >
          Unlink
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-group">
        <ToolbarButton disabled={!editor.can().undo()} label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          &#8630;
        </ToolbarButton>
        <ToolbarButton disabled={!editor.can().redo()} label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          &#8631;
        </ToolbarButton>
      </div>
    </div>
  );
}

export function AdminRichTextEditor({
  ariaLabel = "Rich text content",
  initialHtml,
  name
}: {
  ariaLabel?: string;
  initialHtml: string;
  name: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialHtml);

  const editor = useEditor({
    extensions: editorExtensions,
    content: initialHtml,
    // Next renders this on the server first; deferring the first paint to the
    // client is what TipTap requires to avoid a hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class: "rich-text-content",
        role: "textbox"
      }
    },
    onUpdate: ({ editor: instance }) => {
      // An "empty" document still serialises to <p></p>, which would otherwise
      // be stored as a description that looks blank but is not.
      const next = instance.isEmpty ? "" : instance.getHTML();
      setValue(next);
      if (inputRef.current) inputRef.current.value = next;
    }
  });

  return (
    <div className="rich-text-editor">
      <input name={name} ref={inputRef} type="hidden" value={value} readOnly />
      {editor ? <Toolbar editor={editor} /> : <div className="rich-text-toolbar" aria-hidden="true" />}
      <EditorContent editor={editor} />
    </div>
  );
}
