"use client";

import TextAlign from "@tiptap/extension-text-align";
import { BackgroundColor, Color, FontSize, LineHeight, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useRef, useState, type ReactNode } from "react";

/**
 * Product description editor.
 *
 * The extension set is kept in step with sanitizeRichText, so whatever an admin
 * sees here is exactly what the storefront renders. Anything the sanitizer would
 * strip (code, code blocks, rules, h1/h4-h6) stays turned off rather than being
 * silently discarded after saving.
 *
 * Colour, size, alignment and line spacing all travel as inline `style`
 * declarations. The sanitizer accepts only those specific properties, and only
 * values matching its regexes -- see allowedInlineStyles in lib/products/rich-text.
 */
const fontSizes = ["12px", "14px", "16px", "18px", "20px", "24px", "32px", "40px"];
const lineHeights = [
  { label: "Single", value: "1.4" },
  { label: "1.15", value: "1.15" },
  { label: "1.5", value: "1.5" },
  { label: "Double", value: "2" }
];

// Hex only, and only values the sanitizer's colour regex accepts.
const textColors = [
  { label: "Default", value: "" },
  { label: "Black", value: "#111827" },
  { label: "Grey", value: "#6b7280" },
  { label: "Red", value: "#c0392b" },
  { label: "Orange", value: "#d97706" },
  { label: "Green", value: "#15803d" },
  { label: "Blue", value: "#0e52a4" }
];

const highlightColors = [
  { label: "None", value: "" },
  { label: "Yellow", value: "#fff3cd" },
  { label: "Green", value: "#dcfce7" },
  { label: "Blue", value: "#dbeafe" },
  { label: "Pink", value: "#fce7f3" }
];

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ["http", "https", "mailto", "tel"],
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" }
    }
  }),
  TextStyle,
  Color,
  BackgroundColor,
  FontSize,
  // `types` registers the lineHeight attribute (and its style renderer) on the
  // blocks. Its own setLineHeight command is not used: that command hardcodes
  // chain().setMark("textStyle", ...) regardless of this option, so it would
  // write the attribute to a mark that is not in `types` and render nothing.
  // setBlockLineHeight below drives the node attribute instead.
  LineHeight.configure({ types: ["heading", "paragraph"] }),
  TextAlign.configure({ types: ["heading", "paragraph"] })
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

function ToolbarSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <label className="rich-text-select">
      <span className="visually-hidden">{label}</span>
      <select aria-label={label} onChange={(event) => onChange(event.target.value)} title={label} value={value}>
        {options.map((option) => <option key={option.value || option.label} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

/**
 * Line spacing belongs to the block, so it is applied with updateAttributes on
 * paragraph and heading rather than through the extension's own command.
 */
function setBlockLineHeight(editor: Editor, value: string | null) {
  editor
    .chain()
    .focus()
    .updateAttributes("paragraph", { lineHeight: value })
    .updateAttributes("heading", { lineHeight: value })
    .run();
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
        <ToolbarButton active={editor.isActive("strike")} label="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}>
          <s>S</s>
        </ToolbarButton>
      </div>

      <div className="rich-text-toolbar-group">
        <ToolbarSelect
          label="Font size"
          onChange={(value) => (value ? editor.chain().focus().setFontSize(value).run() : editor.chain().focus().unsetFontSize().run())}
          options={[{ label: "Size", value: "" }, ...fontSizes.map((size) => ({ label: size.replace("px", ""), value: size }))]}
          value={(editor.getAttributes("textStyle").fontSize as string) ?? ""}
        />
        <ToolbarSelect
          label="Text colour"
          onChange={(value) => (value ? editor.chain().focus().setColor(value).run() : editor.chain().focus().unsetColor().run())}
          options={textColors}
          value={(editor.getAttributes("textStyle").color as string) ?? ""}
        />
        <ToolbarSelect
          label="Highlight colour"
          onChange={(value) => (value ? editor.chain().focus().setBackgroundColor(value).run() : editor.chain().focus().unsetBackgroundColor().run())}
          options={highlightColors}
          value={(editor.getAttributes("textStyle").backgroundColor as string) ?? ""}
        />
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
        <ToolbarButton active={editor.isActive({ textAlign: "left" })} label="Align left" onClick={() => editor.chain().focus().setTextAlign("left").run()}>
          &#8801;
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "center" })} label="Align centre" onClick={() => editor.chain().focus().setTextAlign("center").run()}>
          &#8803;
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "right" })} label="Align right" onClick={() => editor.chain().focus().setTextAlign("right").run()}>
          &#8802;
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "justify" })} label="Justify" onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
          &#9776;
        </ToolbarButton>
        <ToolbarSelect
          label="Line spacing"
          onChange={(value) => setBlockLineHeight(editor, value || null)}
          options={[{ label: "Spacing", value: "" }, ...lineHeights]}
          value={(editor.getAttributes("paragraph").lineHeight as string) ?? (editor.getAttributes("heading").lineHeight as string) ?? ""}
        />
      </div>

      <div className="rich-text-toolbar-group">
        <ToolbarButton active={editor.isActive("bulletList")} label="Bulleted list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          &#8226;&#8195;
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
        <ToolbarButton
          label="Clear formatting"
          onClick={() => {
            editor.chain().focus().unsetAllMarks().unsetTextAlign().run();
            setBlockLineHeight(editor, null);
          }}
        >
          &#10005;A
        </ToolbarButton>
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
