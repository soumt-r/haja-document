// The Haja editor look: warm paper, ink text, and the seal red reserved for the
// sentence skeleton (verbs like 정하자/출력하자 and the particles 을/를/으로).
// Shared by every CodeMirror instance (docs examples, side drawer, playground).
import { EditorView } from "codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const ink = "#1b1a17";
const inkSoft = "#57534b";
const inkFaint = "#8f897d";
const rule = "#d8d1c2";
const seal = "#c8371b";
const sealDeep = "#a52b12";
const moss = "#5a6b3f"; // strings
const indigo = "#3d4b66"; // types
const umber = "#7c4a2d"; // function names

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: seal, fontWeight: "700" },
  { tag: t.meta, color: seal }, // particles
  { tag: t.string, color: moss },
  { tag: t.number, color: sealDeep },
  { tag: t.bool, color: sealDeep, fontWeight: "700" },
  { tag: t.typeName, color: indigo },
  { tag: t.propertyName, color: umber },
  { tag: t.variableName, color: ink },
  { tag: t.comment, color: inkFaint, fontStyle: "italic" },
  { tag: t.operator, color: inkSoft },
  { tag: t.bracket, color: inkSoft },
]);

export function hajaTheme(opts: { height?: string; maxHeight?: string; fontSize?: string } = {}) {
  return [
    EditorView.theme({
      "&": {
        height: opts.height ?? "auto",
        maxHeight: opts.maxHeight,
        fontSize: opts.fontSize ?? "14.5px",
        color: ink,
        backgroundColor: "#fbf9f4",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": {
        fontFamily: '"D2Coding", ui-monospace, "Cascadia Mono", monospace',
        lineHeight: "1.85",
        overflow: "auto",
      },
      ".cm-content": { caretColor: seal, padding: "0.75rem 0" },
      ".cm-cursor": { borderLeftColor: seal, borderLeftWidth: "2px" },
      ".cm-gutters": { backgroundColor: "#f3efe5", borderRight: `1px solid ${rule}`, color: inkFaint },
      ".cm-activeLine": { backgroundColor: "#f3efe5" },
      ".cm-activeLineGutter": { backgroundColor: "#ece7db", color: ink },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "#f3dcd4" },
      ".cm-tooltip": { border: `1px solid ${rule}`, backgroundColor: "#fbf9f4", borderRadius: "2px" },
      ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: seal, color: "#f6f3ec" },
    }),
    syntaxHighlighting(highlight),
  ];
}
