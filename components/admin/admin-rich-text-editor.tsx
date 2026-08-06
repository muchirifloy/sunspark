"use client";

import { useRef } from "react";

type EditorCommand = "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList" | "undo" | "redo";

export function AdminRichTextEditor({
  ariaLabel = "Rich text content",
  initialHtml,
  name,
}: {
  ariaLabel?: string;
  initialHtml: string;
  name: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  function syncValue() {
    if (inputRef.current) inputRef.current.value = editorRef.current?.innerHTML ?? "";
  }

  function saveSelection() {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }

  function restoreSelection() {
    const range = savedRangeRef.current;
    if (!range) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function run(command: EditorCommand) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command);
    saveSelection();
    syncValue();
  }

  function formatBlock(tag: string) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("formatBlock", false, tag);
    saveSelection();
    syncValue();
  }

  function openLinkEditor() {
    saveSelection();
    if (detailsRef.current) detailsRef.current.open = true;
    window.setTimeout(() => linkRef.current?.focus(), 0);
  }

  function addLink() {
    const url = linkRef.current?.value.trim() ?? "";
    if (!url) return;
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("createLink", false, /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`);
    if (linkRef.current) linkRef.current.value = "";
    if (detailsRef.current) detailsRef.current.open = false;
    saveSelection();
    syncValue();
  }

  return (
    <div className="rich-text-editor">
      <input defaultValue={initialHtml} name={name} ref={inputRef} type="hidden" />
      <div className="rich-text-toolbar" role="toolbar" aria-label="Text formatting">
        <select aria-label="Text style" defaultValue="p" onMouseDown={saveSelection} onChange={(event) => formatBlock(event.target.value)}>
          <option value="p">Normal</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
          <option value="blockquote">Quote</option>
        </select>
        <span aria-hidden="true" />
        <button aria-label="Bold" onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => run("bold")} type="button"><strong>B</strong></button>
        <button aria-label="Italic" onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => run("italic")} type="button"><em>I</em></button>
        <button aria-label="Underline" onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => run("underline")} type="button"><u>U</u></button>
        <button aria-label="Bulleted list" onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => run("insertUnorderedList")} type="button">• List</button>
        <button aria-label="Numbered list" onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => run("insertOrderedList")} type="button">1. List</button>
        <button aria-label="Add link" onMouseDown={(event) => event.preventDefault()} onClick={openLinkEditor} type="button">Link</button>
        <button aria-label="Undo" onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => run("undo")} type="button">↶</button>
        <button aria-label="Redo" onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => run("redo")} type="button">↷</button>
      </div>
      <details className="rich-text-link-details" ref={detailsRef}>
        <summary>Add a link</summary>
        <div className="rich-text-link-row">
          <input aria-label="Link URL" placeholder="https://example.com" ref={linkRef} type="url" />
          <button onClick={addLink} type="button">Add link</button>
          <button onClick={() => { if (detailsRef.current) detailsRef.current.open = false; }} type="button">Cancel</button>
        </div>
      </details>
      <div
        aria-label={ariaLabel}
        className="rich-text-content"
        contentEditable
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        onBlur={syncValue}
        onInput={syncValue}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
        tabIndex={0}
      />
    </div>
  );
}
