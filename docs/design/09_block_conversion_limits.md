# Design Document

Block Conversion Limits  
Local-First Knowledge Environment  
(Tauri 2 + Vue 3)

## 1. Purpose

This document describes how block conversion currently works in the editor block menu, what data is preserved, and where structure is intentionally or accidentally flattened today.

The goal of this phase is not to make every conversion lossless.  
The goal is to make the current behavior explicit, testable, and predictable before expanding conversion behavior further.

## 2. Scope

This document covers the `turnInto` flow implemented in:

- `src/domains/editor/lib/tiptap/blockMenu/actions.ts`

It does not define multi-block conversion behavior.  
Current conversion is single-target only, even when the UI selection suggests a larger scope.

## 3. Conversion Model

`turnInto(editor, target, type)` follows two different strategies depending on the source block.

### 3.1 Fragment-preserving path

When the source node is one of:

- `paragraph`
- `heading`
- `listItem`
- `taskItem`

the conversion tries to reuse the source inline fragment through `extractInlineFragmentFromNode()`.

This preserves rich inline structure such as:

- `wikilink` inline nodes
- text marks like `bold`, `italic`, `code`
- `hardBreak` nodes

This is the best-case path and is the least lossy one in the current implementation.

### 3.2 Text-reconstruction path

When the source node is any other block, conversion falls back to `sourceTextForTurnInto()`, which is based on `lineText(node)`.

This path serializes the source into plain text first, then rebuilds the target from that text.

This preserves:

- visible text payload
- some block attributes that already store text (`quoteBlock.text`, `calloutBlock.message`, `mermaidBlock.code`, `htmlBlock.html`)

This does not preserve:

- inline node identity
- marks
- structural richness beyond what `lineText()` expresses

## 4. Current Rules By Source Family

### Paragraphs and headings

- Converting to headings or list families usually preserves inline richness.
- Converting to `quote` becomes lossy because the target stores only a text attribute.

### Lists and task lists

- Converting list families to other list families converts the nearest ancestor list, not only the active item.
- Inline richness in the leading paragraph of each item is preserved.
- Nested list children are retained as nested children of the converted item.
- Converting a list to a non-list target flattens the hierarchy into text.

### Code blocks

- Code content is treated as plain text.
- Markdown-like syntax inside code is not reparsed during conversion.
- Converting code to list types produces one list item whose paragraph contains the original text payload.

### Quote, callout, mermaid, and HTML blocks

- These blocks are treated as text-bearing atom blocks.
- Their text-bearing attributes are copied into the target text payload.
- Conversion from these blocks does not preserve any richer internal structure because none is modeled in the conversion path.

### Tables

- Tables are flattened row by row into textual lines.
- Cells are joined with ` | `.
- Internal paragraph text inside cells is collapsed according to `textContent` behavior.
- This means a cell containing a `hardBreak` is flattened more aggressively than a paragraph converted through fragment reuse.

## 5. Observed Limits

The current test suite intentionally documents these limits as stable behavior.

### 5.1 Rich inline content can disappear on text-only targets

Example:

- paragraph containing a `wikilink` plus marks
- converted to `quote`

Result:

- target becomes `quoteBlock`
- output stores only plain text in `attrs.text`
- inline node identity and marks are lost

One important detail: inline atom nodes such as `wikilink` may contribute less text than a user visually expects when conversion falls back to plain-text extraction.

### 5.2 Nested list structure is flattened on non-list targets

Example:

- bullet list with nested child list
- converted to `paragraph`

Result:

- hierarchy becomes a single paragraph
- nested relationships are represented only through newline-separated text

### 5.3 Markdown-looking code is never reinterpreted

Example:

- code block containing `- alpha`, `- beta`, `[[Note]]`
- converted to `bulletList`

Result:

- one list item containing plain text
- no nested list parsing
- no wikilink parsing

### 5.4 Table flattening is textual, not semantic

Example:

- table cells with multiple paragraphs or hard breaks

Result:

- rows are reduced to a textual representation
- cell internals are merged according to `lineText()` and `textContent`
- original table semantics are lost

## 6. Testing Strategy

The test suite in `src/domains/editor/lib/tiptap/blockMenu/actions.test.ts` is organized to capture:

- rich inline preservation when fragment reuse is available
- flattening behavior when conversion serializes through `lineText()`
- ancestor-list conversion behavior
- known lossy conversions that are expected today
- a broad source/target matrix to ensure non-empty payloads remain observable

These tests are not intended to claim that the behavior is ideal.  
They are intended to lock the current behavior so future changes are deliberate.

## 7. Implications For Future Work

This mapping is the prerequisite for safe multi-block conversion work.

Before applying conversion to multiple selected blocks, the implementation will need to define:

- whether list conversions act per targeted item or per ancestor list
- whether lossy text-only conversions are acceptable across heterogeneous selections
- how selection and focus should be restored after multiple replacements

Without this baseline, multi-block conversion would risk multiplying undocumented data-loss behaviors.
