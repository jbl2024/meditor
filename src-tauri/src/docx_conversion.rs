//! Markdown to DOCX conversion for the native shell command.
//!
//! This module owns path validation, template discovery, Markdown parsing and
//! DOCX writing. The frontend only invokes the command; it does not perform
//! any document generation itself.

use std::{fs, fs::File, io::Read, path::{Path, PathBuf}};

use comrak::{
    nodes::{AstNode, ListType, NodeTable, NodeValue, TableAlignment},
    parse_document, Arena, Options,
};
use mermaid_rs_renderer::{
    render_with_options, write_output_png, RenderConfig, RenderOptions, Theme,
};
use rdocx::{Alignment, BorderStyle, Document, Length, VerticalAlignment};
use zip::ZipArchive;

use crate::markdown_index::{parse_yaml_frontmatter_properties, strip_yaml_frontmatter};
use crate::{
    active_workspace_root, ensure_within_root, normalize_workspace_path, AppError, Result,
};

const TEMPLATE_DIR_NAME: &str = "_templates";
const DEFAULT_FONT: &str = "Calibri";
const DEFAULT_BODY_SIZE: u32 = 24;
const CODE_FONT: &str = "Courier New";
const CODE_SIZE: u32 = 20;
const TABLE_CELL_MARGIN: f64 = 1.0;
const TABLE_BORDER_SIZE: u32 = 2;
const TABLE_HEADER_FILL: &str = "E8EEF4";
const TABLE_BORDER_COLOR: &str = "B8C4CF";
const QUOTE_FILL: &str = "F5F7F9";
const QUOTE_COLOR: &str = "666666";
const QUOTE_INDENT_PT: f64 = 18.0;
const CALLOUT_HEADER_TEXT: &str = "333333";
const CALLOUT_BODY_TEXT: &str = "333333";
const MERMAID_MAX_WIDTH_IN: f64 = 6.2;
const MERMAID_FALLBACK_HEIGHT_IN: f64 = 3.5;
const MERMAID_EMOJI_REPLACEMENTS: &[(&str, &str)] = &[
    ("✅", "[done]"),
    ("❌", "[fail]"),
    ("⚠️", "[warning]"),
    ("⚠", "[warning]"),
    ("🚧", "[wip]"),
    ("🔥", "[hot]"),
    ("💡", "[idea]"),
    ("🟢", "[ok]"),
    ("🔴", "[error]"),
    ("🟡", "[warn]"),
    ("🔵", "[info]"),
];

#[derive(Debug, Clone, PartialEq, Eq)]
struct TemplateStyle {
    default_font: String,
    body_size: u32,
}

impl Default for TemplateStyle {
    fn default() -> Self {
        Self {
            default_font: DEFAULT_FONT.to_string(),
            body_size: DEFAULT_BODY_SIZE,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
struct TextStyle {
    bold: bool,
    italic: bool,
    code: bool,
    font: Option<String>,
    size: Option<u32>,
    color: Option<String>,
}

#[derive(Debug, Clone)]
struct RunSegment {
    text: String,
    style: TextStyle,
}

#[derive(Debug, Clone)]
struct TableRowData {
    is_header: bool,
    cells: Vec<Vec<RunSegment>>,
    alignments: Vec<TableAlignment>,
}

#[tauri::command]
pub async fn convert_markdown_to_docx(path: String) -> Result<String> {
    tauri::async_runtime::spawn_blocking(move || convert_markdown_to_docx_sync(path))
        .await
        .map_err(|_| AppError::OperationFailed)?
}

fn convert_markdown_to_docx_sync(path: String) -> Result<String> {
    let workspace_root = active_workspace_root()?;
    let source_path = normalize_workspace_path(&workspace_root, &path)?;
    ensure_within_root(&workspace_root, &source_path)?;

    if !source_path.is_file() {
        return Err(AppError::InvalidPath);
    }

    if !is_markdown_path(&source_path) {
        return Err(AppError::InvalidPath);
    }

    let markdown = fs::read_to_string(&source_path)?;
    let template = resolve_template_path(&workspace_root)?;
    let template_style = match template {
        Some(ref path) => read_template_style(path).unwrap_or_default(),
        None => TemplateStyle::default(),
    };

    let mut doc = build_document(&markdown, &template_style);
    let output_path = resolve_output_path(&source_path)?;
    let output_path = next_available_output_path(&output_path);
    doc.save(&output_path)
        .map_err(|_| AppError::OperationFailed)?;

    Ok(output_path.to_string_lossy().to_string())
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

fn resolve_output_path(source_path: &Path) -> Result<PathBuf> {
    let stem = source_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or(AppError::InvalidPath)?;
    let parent = source_path.parent().ok_or(AppError::InvalidPath)?;
    Ok(parent.join(format!("{stem}.docx")))
}

fn next_available_output_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }

    let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("output");
    for index in 1..10_000 {
        let candidate = parent.join(format!("{stem} ({index}).docx"));
        if !candidate.exists() {
            return candidate;
        }
    }

    parent.join(format!("{stem} (9999).docx"))
}

fn resolve_template_path(root: &Path) -> Result<Option<PathBuf>> {
    let templates_dir = root.join(TEMPLATE_DIR_NAME);
    if !templates_dir.is_dir() {
        return Ok(None);
    }

    let mut candidates = fs::read_dir(templates_dir)?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("docx"))
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| left.file_name().cmp(&right.file_name()));
    Ok(candidates.into_iter().next())
}

fn read_template_style(template_path: &Path) -> Result<TemplateStyle> {
    let file = File::open(template_path)?;
    let mut archive = ZipArchive::new(file).map_err(|_| AppError::InvalidOperation(
        "Template DOCX is not a valid Word file.".to_string(),
    ))?;
    let mut styles_xml = String::new();
    archive
        .by_name("word/styles.xml")
        .map_err(|_| AppError::InvalidOperation(
            "Template DOCX is missing styles.".to_string(),
        ))?
        .read_to_string(&mut styles_xml)
        .map_err(|_| AppError::OperationFailed)?;
    Ok(parse_template_style(&styles_xml))
}

fn parse_template_style(styles_xml: &str) -> TemplateStyle {
    let normal_block = styles_xml
        .find(r#"w:styleId="Normal""#)
        .map(|index| &styles_xml[index..])
        .unwrap_or(styles_xml);

    let default_font = extract_xml_attr(normal_block, r#"w:ascii=""#)
        .or_else(|| extract_xml_attr(styles_xml, r#"w:ascii=""#))
        .unwrap_or_else(|| DEFAULT_FONT.to_string());
    let body_size = extract_xml_attr(normal_block, r#"w:sz w:val=""#)
        .or_else(|| extract_xml_attr(styles_xml, r#"w:sz w:val=""#))
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(DEFAULT_BODY_SIZE);

    TemplateStyle {
        default_font,
        body_size,
    }
}

fn extract_xml_attr(haystack: &str, needle: &str) -> Option<String> {
    let start = haystack.find(needle)? + needle.len();
    let remainder = &haystack[start..];
    let end = remainder.find('"')?;
    Some(remainder[..end].to_string())
}

fn build_document(markdown: &str, template_style: &TemplateStyle) -> Document {
    let arena = Arena::new();
    let mut options = Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;

    let frontmatter_rows = build_frontmatter_rows(markdown, template_style);
    let content = strip_yaml_frontmatter(markdown);
    let root = parse_document(&arena, content, &options);
    let mut doc = Document::new();

    if !frontmatter_rows.is_empty() {
        render_key_value_table(&mut doc, &frontmatter_rows, template_style);
    }

    for child in root.children() {
        render_block(
            child,
            &mut doc,
            template_style,
            RenderContext::default(),
        );
    }

    doc
}

#[derive(Debug, Clone, Copy)]
struct RenderContext {
    quote_depth: usize,
    list_depth: usize,
    callout: Option<CalloutKind>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CalloutKind {
    Note,
    Abstract,
    Info,
    Tip,
    Success,
    Question,
    Warning,
    Failure,
    Danger,
    Bug,
    Example,
    Quote,
}

#[derive(Debug, Clone, Copy)]
struct CalloutStyle {
    fill: &'static str,
    border: &'static str,
}

impl CalloutKind {
    fn label(self) -> &'static str {
        match self {
            Self::Note => "Note",
            Self::Abstract => "Abstract",
            Self::Info => "Info",
            Self::Tip => "Tip",
            Self::Success => "Success",
            Self::Question => "Question",
            Self::Warning => "Warning",
            Self::Failure => "Failure",
            Self::Danger => "Danger",
            Self::Bug => "Bug",
            Self::Example => "Example",
            Self::Quote => "Quote",
        }
    }

    fn style(self) -> CalloutStyle {
        match self {
            Self::Note | Self::Info => CalloutStyle { fill: "E7F0FB", border: "C9D9EE" },
            Self::Tip | Self::Success | Self::Example => {
                CalloutStyle { fill: "E6F1E6", border: "C8DCC8" }
            }
            Self::Question => CalloutStyle { fill: "EDE8F6", border: "D5CDEB" },
            Self::Warning | Self::Failure | Self::Danger | Self::Bug => {
                CalloutStyle { fill: "F4E8DF", border: "E0CDB8" }
            }
            Self::Abstract | Self::Quote => CalloutStyle { fill: "EEF1F4", border: "D6DCE3" },
        }
    }
}

impl Default for RenderContext {
    fn default() -> Self {
        Self {
            quote_depth: 0,
            list_depth: 0,
            callout: None,
        }
    }
}

fn render_block<'a>(node: &'a AstNode<'a>, doc: &mut Document, template: &TemplateStyle, ctx: RenderContext) {
    match &node.data.borrow().value {
        NodeValue::Heading(heading) => {
            let mut style = TextStyle {
                bold: true,
                color: Some(match heading.level {
                    1 => "1F3864".to_string(),
                    2 => "2E5090".to_string(),
                    _ => "404040".to_string(),
                }),
                size: Some(match heading.level {
                    1 => 36,
                    2 => 28,
                    3 => 24,
                    _ => 22,
                }),
                font: Some(template.default_font.clone()),
                ..Default::default()
            };
            if ctx.callout.is_some() {
                style.color = Some(CALLOUT_BODY_TEXT.to_string());
            } else if ctx.quote_depth > 0 {
                style.italic = true;
                style.color = Some(QUOTE_COLOR.to_string());
            }
            append_paragraph(doc, build_inline_segments(node, style, template, ctx), template, ctx);
        }
        NodeValue::Paragraph => {
            let mut style = TextStyle {
                font: Some(template.default_font.clone()),
                size: Some(template.body_size),
                ..Default::default()
            };
            if ctx.callout.is_some() {
                style.color = Some(CALLOUT_BODY_TEXT.to_string());
            } else if ctx.quote_depth > 0 {
                style.italic = true;
                style.color = Some(QUOTE_COLOR.to_string());
            }
            append_paragraph(doc, build_inline_segments(node, style, template, ctx), template, ctx);
        }
        NodeValue::BlockQuote | NodeValue::MultilineBlockQuote(_) => {
            if let Some(callout) = detect_callout(node) {
                render_callout_block(node, doc, template, ctx, callout);
            } else {
                let next = RenderContext {
                    quote_depth: ctx.quote_depth + 1,
                    list_depth: ctx.list_depth,
                    callout: ctx.callout,
                };
                for child in node.children() {
                    render_block(child, doc, template, next);
                }
            }
        }
        NodeValue::CodeBlock(code_block) => {
            if is_mermaid_code_block(&code_block.info) {
                if render_mermaid_block(&code_block.literal, doc) {
                    return;
                }
            }
            let mut code_lines = code_block.literal.lines().collect::<Vec<_>>();
            if code_lines.is_empty() {
                code_lines.push("");
            }
            for line in code_lines {
                let segments = vec![RunSegment {
                    text: if line.is_empty() {
                        " ".to_string()
                    } else {
                        line.to_string()
                    },
                    style: TextStyle {
                        font: Some(CODE_FONT.to_string()),
                        size: Some(CODE_SIZE),
                        color: Some("2D2D2D".to_string()),
                        ..Default::default()
                    },
                }];
                append_paragraph(doc, segments, template, ctx);
            }
        }
        NodeValue::ThematicBreak => {
            append_paragraph(doc, vec![RunSegment {
                text: "────────────────".to_string(),
                style: TextStyle {
                    font: Some(template.default_font.clone()),
                    size: Some(template.body_size),
                    color: Some("CCCCCC".to_string()),
                    ..Default::default()
                },
            }], template, ctx);
        }
        NodeValue::List(list) => {
            render_list(node, doc, template, ctx, list.list_type, list.start);
        }
        NodeValue::Table(table) => {
            render_table(node, table, doc, template);
        }
        NodeValue::Document
        | NodeValue::Item(_)
        | NodeValue::TaskItem(_)
        | NodeValue::TableRow(_)
        | NodeValue::TableCell => {
            for child in node.children() {
                render_block(child, doc, template, ctx);
            }
        }
        NodeValue::HtmlBlock(_) | NodeValue::HtmlInline(_) => {}
        _ => {
            for child in node.children() {
                render_block(child, doc, template, ctx);
            }
        }
    }
}

fn detect_callout<'a>(node: &'a AstNode<'a>) -> Option<(CalloutKind, Option<String>)> {
    let mut children = node.children();
    let first = children.next()?;
    if !matches!(first.data.borrow().value, NodeValue::Paragraph) {
        return None;
    }

    let segments = collect_inline_segments_for_node(
        first,
        TextStyle {
            font: Some(DEFAULT_FONT.to_string()),
            size: Some(DEFAULT_BODY_SIZE),
            ..Default::default()
        },
        &TemplateStyle::default(),
    );
    let text = segments
        .iter()
        .map(|segment| segment.text.as_str())
        .collect::<String>();
    parse_callout_marker(&text)
}

fn parse_callout_marker(text: &str) -> Option<(CalloutKind, Option<String>)> {
    let trimmed = text.trim_start();
    let rest = trimmed.strip_prefix("[!")?;
    let end = rest.find(']')?;
    let kind_token = &rest[..end];
    let kind = normalize_callout_kind(kind_token)?;
    let after = rest[end + 1..].trim();
    let title = after
        .strip_prefix(':')
        .map(str::trim_start)
        .unwrap_or(after)
        .trim();
    let title = if title.is_empty() { None } else { Some(title.to_string()) };
    Some((kind, title))
}

fn normalize_callout_kind(input: &str) -> Option<CalloutKind> {
    let token = input
        .trim()
        .to_uppercase()
        .replace(|ch: char| !ch.is_ascii_alphanumeric(), "");

    match token.as_str() {
        "NOTE" => Some(CalloutKind::Note),
        "ABSTRACT" | "SUMMARY" | "TLDR" => Some(CalloutKind::Abstract),
        "INFO" | "TODO" => Some(CalloutKind::Info),
        "TIP" | "HINT" | "IMPORTANT" => Some(CalloutKind::Tip),
        "SUCCESS" | "CHECK" | "DONE" => Some(CalloutKind::Success),
        "QUESTION" | "HELP" | "FAQ" => Some(CalloutKind::Question),
        "WARNING" | "CAUTION" | "ATTENTION" => Some(CalloutKind::Warning),
        "FAILURE" | "FAIL" | "MISSING" => Some(CalloutKind::Failure),
        "DANGER" | "ERROR" => Some(CalloutKind::Danger),
        "BUG" => Some(CalloutKind::Bug),
        "EXAMPLE" => Some(CalloutKind::Example),
        "QUOTE" | "CITE" => Some(CalloutKind::Quote),
        _ => None,
    }
}

fn render_callout_block<'a>(
    node: &'a AstNode<'a>,
    doc: &mut Document,
    template: &TemplateStyle,
    ctx: RenderContext,
    callout: (CalloutKind, Option<String>),
) {
    let (kind, title) = callout;
    let mut children = node.children();
    let _ = children.next();

    let mut header_segments = vec![RunSegment {
        text: kind.label().to_string(),
        style: TextStyle {
            bold: true,
            font: Some(template.default_font.clone()),
            size: Some(template.body_size),
            color: Some(CALLOUT_HEADER_TEXT.to_string()),
            ..Default::default()
        },
    }];
    if let Some(title) = title {
        header_segments.push(RunSegment {
            text: " — ".to_string(),
            style: TextStyle {
                font: Some(template.default_font.clone()),
                size: Some(template.body_size),
                color: Some(CALLOUT_HEADER_TEXT.to_string()),
                ..Default::default()
            },
        });
        header_segments.push(RunSegment {
            text: title,
            style: TextStyle {
                font: Some(template.default_font.clone()),
                size: Some(template.body_size),
                color: Some(CALLOUT_HEADER_TEXT.to_string()),
                ..Default::default()
            },
        });
    }
    let mut header_paragraph = doc.add_paragraph("");
    header_paragraph = style_paragraph(
        header_paragraph,
        ParagraphKind::CalloutHeader { kind },
    );
    append_segments_to_paragraph(&mut header_paragraph, header_segments, template, false);

    let body_ctx = RenderContext {
        quote_depth: ctx.quote_depth,
        list_depth: ctx.list_depth,
        callout: Some(kind),
    };

    for child in children {
        render_block(child, doc, template, body_ctx);
    }
}

fn render_list<'a>(
    node: &'a AstNode<'a>,
    doc: &mut Document,
    template: &TemplateStyle,
    ctx: RenderContext,
    list_type: ListType,
    start: usize,
) {
    let mut ordinal = start;
    for item in node.children() {
        let item_value = item.data.borrow().value.clone();
        let (is_task_item, task_prefix) = match item_value {
            NodeValue::Item(_) => (false, None),
            NodeValue::TaskItem(task_item) => (true, Some(task_item_prefix(task_item.symbol))),
            _ => continue,
        };

        if is_task_item {
            // Task list items use the same list semantics as regular items, with a visible checkbox.
        }

        let item_ctx = RenderContext {
            quote_depth: ctx.quote_depth,
            list_depth: ctx.list_depth + 1,
            callout: ctx.callout,
        };
        let item_prefix = list_prefix(list_type, item_ctx.list_depth, ordinal);
        let item_prefix = if let Some(task_prefix) = task_prefix {
            format!("{item_prefix}{task_prefix}")
        } else {
            item_prefix
        };
        let mut rendered_primary_paragraph = false;

        for child in item.children() {
            match &child.data.borrow().value {
                NodeValue::Paragraph => {
                    let mut segments = build_inline_segments(
                        child,
                        TextStyle {
                            font: Some(template.default_font.clone()),
                            size: Some(template.body_size),
                            ..Default::default()
                        },
                        template,
                        item_ctx,
                    );
                    if !rendered_primary_paragraph {
                        if let Some(first) = segments.first_mut() {
                            first.text = format!("{item_prefix}{}", first.text);
                        } else {
                            segments.push(RunSegment {
                                text: item_prefix.clone(),
                                style: TextStyle {
                                    font: Some(template.default_font.clone()),
                                    size: Some(template.body_size),
                                    ..Default::default()
                                },
                            });
                        }
                        append_paragraph(doc, segments, template, item_ctx);
                        rendered_primary_paragraph = true;
                    } else {
                        append_paragraph(doc, segments, template, item_ctx);
                    }
                }
                NodeValue::Item(_) | NodeValue::TaskItem(_) | NodeValue::List(_) => {
                    render_block(child, doc, template, item_ctx);
                }
                _ => {
                    render_block(child, doc, template, item_ctx);
                }
            }
        }

        if !rendered_primary_paragraph {
            append_paragraph(doc, vec![RunSegment {
                text: item_prefix,
                style: TextStyle {
                    font: Some(template.default_font.clone()),
                    size: Some(template.body_size),
                    ..Default::default()
                },
            }], template, item_ctx);
        }

        if matches!(list_type, ListType::Ordered) {
            ordinal += 1;
        }
    }
}

fn task_item_prefix(symbol: Option<char>) -> &'static str {
    if symbol.is_some() {
        "[x] "
    } else {
        "[ ] "
    }
}

fn render_table<'a>(
    node: &'a AstNode<'a>,
    table_meta: &NodeTable,
    doc: &mut Document,
    template: &TemplateStyle,
) {
    let mut rows = Vec::new();
    for row in node.children() {
        let is_header = matches!(row.data.borrow().value, NodeValue::TableRow(true));
        if !matches!(row.data.borrow().value, NodeValue::TableRow(_)) {
            continue;
        }

        let mut cells = Vec::new();
        for cell in row.children() {
            if !matches!(cell.data.borrow().value, NodeValue::TableCell) {
                continue;
            }
            cells.push(collect_inline_segments_for_node(
                cell,
                TextStyle {
                    font: Some(template.default_font.clone()),
                    size: Some(template.body_size),
                    ..Default::default()
                },
                template,
            ));
        }
        rows.push(TableRowData {
            is_header,
            cells,
            alignments: table_meta.alignments.clone(),
        });
    }

    if rows.is_empty() {
        return;
    }

    render_compact_table(doc, rows, template);
}

fn render_key_value_table(doc: &mut Document, rows: &[TableRowData], template: &TemplateStyle) {
    if rows.is_empty() {
        return;
    }

    let mut data_rows = Vec::with_capacity(rows.len() + 1);
    data_rows.push(TableRowData {
        is_header: true,
        cells: vec![
            vec![RunSegment {
                text: "Key".to_string(),
                style: TextStyle {
                    bold: true,
                    font: Some(template.default_font.clone()),
                    size: Some(template.body_size),
                    ..Default::default()
                },
            }],
            vec![RunSegment {
                text: "Value".to_string(),
                style: TextStyle {
                    bold: true,
                    font: Some(template.default_font.clone()),
                    size: Some(template.body_size),
                    ..Default::default()
                },
            }],
        ],
        alignments: vec![TableAlignment::Left, TableAlignment::Left],
    });
    data_rows.extend(rows.iter().cloned());
    render_compact_table(doc, data_rows, template);
}

fn is_mermaid_code_block(info: &str) -> bool {
    info.split_whitespace()
        .next()
        .map(|token| token.eq_ignore_ascii_case("mermaid"))
        .unwrap_or(false)
}

fn render_mermaid_block(code: &str, doc: &mut Document) -> bool {
    let sanitized_code = sanitize_mermaid_emojis(code);
    let Ok(svg) = render_with_options(&sanitized_code, RenderOptions::mermaid_default()) else {
        return false;
    };

    let theme = Theme::mermaid_default();
    let render_cfg = RenderConfig {
        background: theme.background.clone(),
        ..RenderConfig::default()
    };
    let png_path = std::env::temp_dir().join(format!(
        "tomosona-mermaid-{}-{}.png",
        std::process::id(),
        unique_temp_stamp()
    ));

    if write_output_png(&svg, &png_path, &render_cfg, &theme).is_err() {
        return false;
    }

    let Ok(png) = fs::read(&png_path) else {
        #[cfg(test)]
        eprintln!("mermaid png read failed: {}", png_path.display());
        let _ = fs::remove_file(&png_path);
        return false;
    };
    let _ = fs::remove_file(&png_path);

    let Some((width_px, height_px)) = png_dimensions(&png) else {
        return false;
    };

    let (width, height) = png_display_size(width_px as f64, height_px as f64).unwrap_or((
        Length::inches(MERMAID_MAX_WIDTH_IN),
        Length::inches(MERMAID_FALLBACK_HEIGHT_IN),
    ));
    let mut paragraph = doc
        .add_picture(&png, "mermaid.png", width, height)
        .alignment(Alignment::Center)
        .space_before(Length::pt(2.0))
        .space_after(Length::pt(4.0));
    paragraph = paragraph.keep_together(true);
    let _ = paragraph;
    true
}

fn sanitize_mermaid_emojis(input: &str) -> String {
    let mut output = input.to_string();
    for (emoji, replacement) in MERMAID_EMOJI_REPLACEMENTS {
        output = output.replace(emoji, replacement);
    }
    output
}

fn unique_temp_stamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if bytes.len() < 24 || &bytes[..8] != PNG_SIGNATURE {
        return None;
    }

    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    Some((width, height))
}

fn png_display_size(width_px: f64, height_px: f64) -> Option<(Length, Length)> {
    if width_px <= 0.0 || height_px <= 0.0 {
        return None;
    }

    let width_in = width_px / 96.0;
    let height_in = height_px / 96.0;
    if width_in <= MERMAID_MAX_WIDTH_IN {
        return Some((Length::inches(width_in), Length::inches(height_in)));
    }

    let scale = MERMAID_MAX_WIDTH_IN / width_in;
    let scaled_height = (height_in * scale).max(1.0 / 96.0);
    Some((Length::inches(MERMAID_MAX_WIDTH_IN), Length::inches(scaled_height)))
}

fn build_frontmatter_rows(markdown: &str, template: &TemplateStyle) -> Vec<TableRowData> {
    let properties = parse_yaml_frontmatter_properties(markdown);
    if properties.is_empty() {
        return Vec::new();
    }

    properties
        .into_iter()
        .map(|property| TableRowData {
            is_header: false,
            cells: vec![
                vec![RunSegment {
                    text: property.key,
                    style: TextStyle {
                        bold: true,
                        font: Some(template.default_font.clone()),
                        size: Some(template.body_size),
                        ..Default::default()
                    },
                }],
                vec![RunSegment {
                    text: property.value_text.unwrap_or_default(),
                    style: TextStyle {
                        font: Some(template.default_font.clone()),
                        size: Some(template.body_size),
                        ..Default::default()
                    },
                }],
            ],
            alignments: vec![TableAlignment::Left, TableAlignment::Left],
        })
        .collect()
}

fn render_compact_table(doc: &mut Document, rows: Vec<TableRowData>, template: &TemplateStyle) {
    if rows.is_empty() {
        return;
    }

    let column_count = rows
        .iter()
        .map(|row| row.cells.len())
        .max()
        .unwrap_or(1)
        .max(1);
    let row_count = rows.len();
    let is_key_value_table = column_count == 2 && rows.first().map(|row| row.is_header).unwrap_or(false);
    let mut table = doc
        .add_table(row_count, column_count)
        .width(Length::inches(6.5))
        .layout_fixed()
        .borders(BorderStyle::Single, TABLE_BORDER_SIZE, TABLE_BORDER_COLOR)
        .cell_margins(
            Length::pt(TABLE_CELL_MARGIN),
            Length::pt(TABLE_CELL_MARGIN),
            Length::pt(TABLE_CELL_MARGIN),
            Length::pt(TABLE_CELL_MARGIN),
        );

    for (row_idx, row) in rows.into_iter().enumerate() {
        if row.is_header {
            if let Some(r) = table.row(row_idx) {
                let _ = r.header();
            }
        }

        for col_idx in 0..column_count {
            let alignment = row
                .alignments
                .get(col_idx)
                .copied()
                .unwrap_or(TableAlignment::None);
            let cell_segments = row.cells.get(col_idx).cloned().unwrap_or_default();

            if let Some(mut cell) = table.cell(row_idx, col_idx) {
                cell = cell.vertical_alignment(VerticalAlignment::Top);
                if row.is_header {
                    cell = cell.shading(TABLE_HEADER_FILL);
                }

                let mut paragraph = cell
                    .add_paragraph("")
                    .space_before(Length::pt(0.0))
                    .space_after(Length::pt(0.0))
                    .line_spacing_multiple(1.0)
                    .keep_together(true);
                if let Some(paragraph_alignment) =
                    table_alignment_to_paragraph_alignment(alignment)
                {
                    paragraph = paragraph.alignment(paragraph_alignment);
                }
                append_segments_to_paragraph(&mut paragraph, cell_segments, template, row.is_header);
            }
        }
    }

    if is_key_value_table {
        let key_width = Length::inches(1.8);
        let value_width = Length::inches(4.7);
        for row_idx in 0..row_count {
            if let Some(mut key_cell) = table.cell(row_idx, 0) {
                key_cell = key_cell.width(key_width);
                let _ = key_cell;
            }
            if let Some(mut value_cell) = table.cell(row_idx, 1) {
                value_cell = value_cell.width(value_width);
                let _ = value_cell;
            }
        }
    }
}

fn build_inline_segments<'a>(
    node: &'a AstNode<'a>,
    style: TextStyle,
    template: &TemplateStyle,
    _ctx: RenderContext,
) -> Vec<RunSegment> {
    let mut segments = Vec::new();
    collect_inline_segments(node, &style, &mut segments, template);
    segments
}

fn collect_inline_segments<'a>(
    node: &'a AstNode<'a>,
    base_style: &TextStyle,
    segments: &mut Vec<RunSegment>,
    template: &TemplateStyle,
) {
    for child in node.children() {
        match &child.data.borrow().value {
            NodeValue::Text(text) => {
                push_segment(segments, text.as_ref(), base_style.clone());
            }
            NodeValue::Code(code) => {
                let mut style = base_style.clone();
                style.code = true;
                style.font = Some(CODE_FONT.to_string());
                style.size = Some(CODE_SIZE);
                push_segment(segments, &code.literal, style);
            }
            NodeValue::Strong => {
                let mut style = base_style.clone();
                style.bold = true;
                collect_inline_segments(child, &style, segments, template);
            }
            NodeValue::Emph => {
                let mut style = base_style.clone();
                style.italic = true;
                collect_inline_segments(child, &style, segments, template);
            }
            NodeValue::Strikethrough => {
                collect_inline_segments(child, base_style, segments, template);
            }
            NodeValue::Link(_) | NodeValue::WikiLink(_) | NodeValue::Image(_) => {
                collect_inline_segments(child, base_style, segments, template);
            }
            NodeValue::SoftBreak => {
                push_segment(segments, " ", base_style.clone());
            }
            NodeValue::LineBreak => {
                push_segment(segments, " ", base_style.clone());
            }
            NodeValue::Raw(raw) => {
                push_segment(segments, raw, base_style.clone());
            }
            NodeValue::HtmlInline(html) => {
                push_segment(segments, html, base_style.clone());
            }
            NodeValue::TaskItem(_) => {}
            _ => {
                if child.data.borrow().value.contains_inlines() {
                    collect_inline_segments(child, base_style, segments, template);
                }
            }
        }
    }

    if segments.is_empty() {
        segments.push(RunSegment {
            text: String::new(),
            style: base_style.clone(),
        });
    }
}

fn collect_inline_segments_for_node<'a>(
    node: &'a AstNode<'a>,
    base_style: TextStyle,
    template: &TemplateStyle,
) -> Vec<RunSegment> {
    let mut segments = Vec::new();
    collect_inline_segments(node, &base_style, &mut segments, template);
    segments
}

fn push_segment(segments: &mut Vec<RunSegment>, text: &str, style: TextStyle) {
    if text.is_empty() {
        return;
    }

    if let Some(last) = segments.last_mut() {
        if last.style == style {
            last.text.push_str(text);
            return;
        }
    }

    segments.push(RunSegment {
        text: text.to_string(),
        style,
    });
}

fn append_paragraph(
    doc: &mut Document,
    segments: Vec<RunSegment>,
    template: &TemplateStyle,
    ctx: RenderContext,
) {
    let mut paragraph = doc.add_paragraph("");
    paragraph = style_paragraph(
        paragraph,
        ParagraphKind::Body {
            quote_depth: ctx.quote_depth,
            callout: ctx.callout,
        },
    );
    append_segments_to_paragraph(&mut paragraph, segments, template, false);
}

enum ParagraphKind {
    Body {
        quote_depth: usize,
        callout: Option<CalloutKind>,
    },
    CalloutHeader { kind: CalloutKind },
}

fn style_paragraph<'a>(
    paragraph: rdocx::Paragraph<'a>,
    kind: ParagraphKind,
) -> rdocx::Paragraph<'a> {
    match kind {
        ParagraphKind::Body { quote_depth, callout } => {
            if let Some(callout_kind) = callout {
                let palette = callout_kind.style();
                paragraph
                    .space_before(Length::pt(0.0))
                    .space_after(Length::pt(2.0))
                    .indent_left(Length::pt(0.0))
                    .indent_right(Length::pt(0.0))
                    .shading(palette.fill)
                    .border_all(BorderStyle::Single, 8, palette.border)
                    .line_spacing_multiple(1.0)
                    .keep_together(true)
            } else if quote_depth == 0 {
                paragraph
                    .space_before(Length::pt(0.0))
                    .space_after(Length::pt(5.0))
            } else {
                let indent = QUOTE_INDENT_PT * quote_depth as f64;
                paragraph
                    .indent_left(Length::pt(indent))
                    .space_before(Length::pt(2.0))
                    .space_after(Length::pt(2.0))
                    .shading(QUOTE_FILL)
                    .line_spacing_multiple(1.0)
            }
        }
        ParagraphKind::CalloutHeader { kind } => {
            let palette = kind.style();
            paragraph
                .space_before(Length::pt(2.0))
                .space_after(Length::pt(2.0))
                .indent_left(Length::pt(0.0))
                .indent_right(Length::pt(0.0))
                .shading(palette.fill)
                .border_all(BorderStyle::Single, 8, palette.border)
                .line_spacing_multiple(1.0)
                .keep_together(true)
        }
    }
}

fn append_segments_to_paragraph<'a>(
    paragraph: &mut rdocx::Paragraph<'a>,
    segments: Vec<RunSegment>,
    template: &TemplateStyle,
    header_row: bool,
) {
    for segment in segments {
        if segment.text.is_empty() {
            continue;
        }

        let mut style = segment.style.clone();
        if header_row {
            style.bold = true;
        }
        let run = paragraph.add_run(&segment.text);
        let _run = apply_run_style(run, &style, template);
    }
}

fn apply_run_style<'a>(
    run: rdocx::Run<'a>,
    style: &TextStyle,
    template: &TemplateStyle,
) -> rdocx::Run<'a> {
    let font = style
        .font
        .as_deref()
        .unwrap_or(template.default_font.as_str());
    let size = style.size.unwrap_or(template.body_size) as f64 / 2.0;

    let mut run = run.font(font).size(size);
    if style.bold {
        run = run.bold(true);
    }
    if style.italic {
        run = run.italic(true);
    }
    if style.code {
        run = run.font(CODE_FONT).size(CODE_SIZE as f64 / 2.0);
    }
    if let Some(color) = style.color.as_deref() {
        run = run.color(color);
    }
    run
}

fn list_prefix(list_type: ListType, depth: usize, ordinal: usize) -> String {
    let indent = "  ".repeat(depth.saturating_sub(1));
    match list_type {
        ListType::Bullet => {
            let bullet = match depth {
                0 | 1 => '•',
                _ => '◦',
            };
            format!("{indent}{bullet} ")
        }
        ListType::Ordered => {
            let marker = if ordinal == 0 {
                "1.".to_string()
            } else {
                format!("{ordinal}.")
            };
            format!("{indent}{marker} ")
        }
    }
}

fn table_alignment_to_paragraph_alignment(alignment: TableAlignment) -> Option<Alignment> {
    match alignment {
        TableAlignment::None => None,
        TableAlignment::Left => Some(Alignment::Left),
        TableAlignment::Center => Some(Alignment::Center),
        TableAlignment::Right => Some(Alignment::Right),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        io::Write,
        time::{SystemTime, UNIX_EPOCH},
    };

    use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

    fn workspace_test_guard() -> std::sync::MutexGuard<'static, ()> {
        crate::workspace_test_guard()
    }

    fn create_temp_workspace(prefix: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("{prefix}-{nonce}"));
        fs::create_dir_all(&dir).expect("create temp workspace");
        dir
    }

    fn write_minimal_docx(path: &Path, font: &str, size: u32) {
        let file = File::create(path).expect("create docx fixture");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

        let styles_xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="{font}" w:hAnsi="{font}" />
        <w:sz w:val="{size}" />
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal" />
    <w:rPr>
      <w:rFonts w:ascii="{font}" w:hAnsi="{font}" />
      <w:sz w:val="{size}" />
    </w:rPr>
  </w:style>
</w:styles>"#
        );
        let document_xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Template</w:t></w:r></w:p>
  </w:body>
</w:document>"#;
        let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#;
        let rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;
        let document_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>"#;

        zip.start_file("[Content_Types].xml", options).expect("write content types");
        zip.write_all(content_types.as_bytes()).expect("content types");
        zip.add_directory("_rels", options).expect("dir");
        zip.start_file("_rels/.rels", options).expect("write rels");
        zip.write_all(rels.as_bytes()).expect("rels");
        zip.add_directory("word", options).expect("dir");
        zip.start_file("word/document.xml", options).expect("write doc");
        zip.write_all(document_xml.as_bytes()).expect("doc xml");
        zip.start_file("word/styles.xml", options).expect("write styles");
        zip.write_all(styles_xml.as_bytes()).expect("styles xml");
        zip.add_directory("word/_rels", options).expect("dir");
        zip.start_file("word/_rels/document.xml.rels", options)
            .expect("write doc rels");
        zip.write_all(document_rels.as_bytes()).expect("doc rels");
        zip.finish().expect("finish docx");
    }

    fn read_docx_paragraphs(path: &Path) -> Vec<String> {
        let doc = Document::open(path).expect("open docx");
        doc.paragraphs().into_iter().map(|para| para.text()).collect()
    }

    fn read_docx_table(path: &Path) -> (usize, usize, Vec<Vec<String>>, Vec<bool>, Vec<Vec<Option<String>>>, Vec<Vec<Option<Alignment>>>) {
        let doc = Document::open(path).expect("open docx");
        let tables = doc.tables();
        assert_eq!(tables.len(), 1, "expected exactly one table");
        let table = &tables[0];

        let row_count = table.row_count();
        let column_count = table.column_count();
        let mut cells = Vec::new();
        let mut headers = Vec::new();
        let mut shadings = Vec::new();
        let mut alignments = Vec::new();

        for row_idx in 0..row_count {
            let row = table.row(row_idx).expect("row");
            headers.push(row.is_header());

            let mut row_text = Vec::new();
            let mut row_shading = Vec::new();
            let mut row_alignment = Vec::new();
            for col_idx in 0..column_count {
                let cell = table.cell(row_idx, col_idx).expect("cell");
                row_text.push(cell.text().trim().to_string());
                row_shading.push(cell.shading_fill().map(|value| value.to_string()));
                row_alignment.push(
                    cell.paragraphs()
                        .find(|p| !p.text().is_empty() || p.alignment().is_some())
                        .and_then(|p| p.alignment()),
                );
            }
            cells.push(row_text);
            shadings.push(row_shading);
            alignments.push(row_alignment);
        }

        (row_count, column_count, cells, headers, shadings, alignments)
    }

    fn read_docx_media_names(path: &Path) -> Vec<String> {
        let file = File::open(path).expect("open docx file");
        let mut archive = ZipArchive::new(file).expect("open docx zip");
        let mut names = Vec::new();
        for index in 0..archive.len() {
            let entry = archive.by_index(index).expect("zip entry");
            let name = entry.name().to_string();
            if name.starts_with("word/media/") {
                names.push(name);
            }
        }
        names
    }

    #[test]
    fn parse_template_style_reads_default_font_and_size() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" />
        <w:sz w:val="30" />
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal" />
    <w:rPr>
      <w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" />
      <w:sz w:val="30" />
    </w:rPr>
  </w:style>
</w:styles>"#;
        let style = parse_template_style(xml);
        assert_eq!(style.default_font, "Aptos");
        assert_eq!(style.body_size, 30);
    }

    #[test]
    fn resolve_template_path_picks_first_docx() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-template");
        let templates = workspace.join("_templates");
        fs::create_dir_all(&templates).expect("create templates");
        write_minimal_docx(&templates.join("b.docx"), "Courier New", 24);
        write_minimal_docx(&templates.join("a.docx"), "Aptos", 28);
        fs::write(templates.join("ignore.txt"), "x").expect("write ignore");

        let template = resolve_template_path(&workspace).expect("resolve template");
        assert_eq!(
            template.as_ref().and_then(|path| path.file_name()).and_then(|name| name.to_str()),
            Some("a.docx")
        );
    }

    #[test]
    fn next_available_output_path_adds_suffix_on_collision() {
        let workspace = create_temp_workspace("tomosona-docx-output");
        let source = workspace.join("note.md");
        fs::write(&source, "# Note").expect("write note");
        let output = resolve_output_path(&source).expect("output");
        fs::write(&output, "occupied").expect("occupy output");
        let next = next_available_output_path(&output);
        assert!(next.ends_with("note (1).docx"));
    }

    #[test]
    fn convert_markdown_to_docx_writes_docx_and_uses_template() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-convert");
        let templates = workspace.join("_templates");
        fs::create_dir_all(&templates).expect("create templates");
        write_minimal_docx(&templates.join("template.docx"), "Aptos", 30);

        let source = workspace.join("note.md");
        fs::write(
            &source,
            "# Title\n\nParagraph with **bold**, *italic*, and `code`.\n\n> Quote\n\n- One\n- Two\n\n1. First\n2. Second\n\n| A | B |\n|---|---|\n| 1 | 2 |\n",
        )
        .expect("write note");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        assert!(output.ends_with("note.docx"));
        let paragraphs = read_docx_paragraphs(Path::new(&output));
        let joined = paragraphs.join("\n");
        assert!(joined.contains("Title"));
        assert!(joined.contains("Paragraph with"));
        assert!(joined.contains("bold"));
        assert!(joined.contains("italic"));
        assert!(joined.contains("code"));
        assert!(joined.contains("Quote"));
        assert!(joined.contains("• One") || joined.contains("•  One"));
        assert!(joined.contains("1. First"));
        assert!(!joined.contains("| A | B |"));

        let (row_count, column_count, cells, headers, shadings, alignments) =
            read_docx_table(Path::new(&output));
        assert_eq!(row_count, 2);
        assert_eq!(column_count, 2);
        assert_eq!(cells, vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["1".to_string(), "2".to_string()],
        ]);
        assert_eq!(headers, vec![true, false]);
        assert_eq!(shadings[0][0].as_deref(), Some(TABLE_HEADER_FILL));
        assert_eq!(shadings[0][1].as_deref(), Some(TABLE_HEADER_FILL));
        assert_eq!(alignments[0][0], None);
    }

    #[test]
    fn convert_markdown_to_docx_preserves_empty_and_ragged_table_cells() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-ragged");
        fs::create_dir_all(workspace.join("_templates")).expect("templates");
        let source = workspace.join("ragged.md");
        fs::write(
            &source,
            "| H1 | H2 | H3 |\n| --- | :---: | ---: |\n| A | | C |\n| B | C |\n",
        )
        .expect("write ragged");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        let (row_count, column_count, cells, headers, shadings, alignments) =
            read_docx_table(Path::new(&output));
        assert_eq!(row_count, 3);
        assert_eq!(column_count, 3);
        assert_eq!(headers, vec![true, false, false]);
        assert_eq!(
            cells,
            vec![
                vec!["H1".to_string(), "H2".to_string(), "H3".to_string()],
                vec!["A".to_string(), String::new(), "C".to_string()],
                vec!["B".to_string(), "C".to_string(), String::new()],
            ]
        );
        assert_eq!(shadings[0][0].as_deref(), Some(TABLE_HEADER_FILL));
        assert_eq!(alignments[0][0], None);
        assert_eq!(alignments[0][1], Some(Alignment::Center));
        assert_eq!(alignments[0][2], Some(Alignment::Right));
        assert_eq!(alignments[1][1], Some(Alignment::Center));
    }

    #[test]
    fn convert_markdown_to_docx_keeps_inline_formatting_in_table_cells() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-inline-table");
        fs::create_dir_all(workspace.join("_templates")).expect("templates");
        let source = workspace.join("inline.md");
        fs::write(
            &source,
            "| Label | Value |\n| --- | --- |\n| Plain | **Bold** and `code` |\n",
        )
        .expect("write inline table");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        let doc = Document::open(&output).expect("open docx");
        let table = doc.tables().into_iter().next().expect("table");
        let cell = table.cell(1, 1).expect("body cell");
        let paragraph = cell
            .paragraphs()
            .find(|p| !p.text().is_empty())
            .expect("content paragraph");
        assert_eq!(paragraph.text(), "Bold and code");
        assert!(paragraph.runs().any(|run| run.text() == "Bold" && run.is_bold()));
        assert!(paragraph
            .runs()
            .any(|run| run.text() == "code" && run.font_name() == Some(CODE_FONT)));
    }

    #[test]
    fn convert_markdown_to_docx_renders_quotes_with_quote_styling() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-quote");
        fs::create_dir_all(workspace.join("_templates")).expect("templates");
        let source = workspace.join("quote.md");
        fs::write(
            &source,
            "> First line\n>\n> Second line\n\nRegular paragraph.\n",
        )
        .expect("write quote");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        let paragraphs = read_docx_paragraphs(Path::new(&output));
        assert!(paragraphs.iter().any(|text| text == "First line"));
        assert!(paragraphs.iter().any(|text| text == "Second line"));
        assert!(!paragraphs.iter().any(|text| text.contains("> ")));

        let doc = Document::open(&output).expect("open docx");
        let quote_paragraph = doc
            .paragraphs()
            .into_iter()
            .find(|paragraph| paragraph.text().trim() == "First line")
            .expect("quote paragraph");
        assert_eq!(quote_paragraph.shading_fill(), Some(QUOTE_FILL));
        assert!(quote_paragraph.runs().any(|run| run.is_italic()));
    }

    #[test]
    fn convert_markdown_to_docx_renders_callouts() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-callout");
        fs::create_dir_all(workspace.join("_templates")).expect("templates");
        let source = workspace.join("callouts.md");
        fs::write(
            &source,
            "> [!NOTE]\n>\n> Callouts are useful.\n>\n> They keep related content together.\n\n> [!WARNING]\n>\n> Inline `code` stays readable.\n",
        )
        .expect("write callouts");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        let doc = Document::open(&output).expect("open docx");
        let note_fill = CalloutKind::Note.style().fill;
        let warning_fill = CalloutKind::Warning.style().fill;

        let note_header = doc
            .paragraphs()
            .into_iter()
            .find(|paragraph| paragraph.text().contains("Note"))
            .expect("note header");
        assert_eq!(note_header.shading_fill(), Some(note_fill));

        let note_body = doc
            .paragraphs()
            .into_iter()
            .find(|paragraph| paragraph.text().contains("Callouts are useful."))
            .expect("note body");
        assert_eq!(note_body.shading_fill(), Some(note_fill));
        assert!(note_body.text().contains("Callouts are useful."));

        let warning_header = doc
            .paragraphs()
            .into_iter()
            .find(|paragraph| paragraph.text().contains("Warning"))
            .expect("warning header");
        assert_eq!(warning_header.shading_fill(), Some(warning_fill));

        let warning_body = doc
            .paragraphs()
            .into_iter()
            .find(|paragraph| paragraph.text().contains("Inline code stays readable."))
            .expect("warning body");
        assert_eq!(warning_body.shading_fill(), Some(warning_fill));
        assert!(warning_body.runs().any(|run| run.text() == "code"));
    }

    #[test]
    fn convert_markdown_to_docx_renders_mermaid_as_image() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-mermaid");
        fs::create_dir_all(workspace.join("_templates")).expect("templates");
        let source = workspace.join("diagram.md");
        fs::write(
            &source,
            "```mermaid\nflowchart LR\n  A[Start] --> B[End]\n```\n\nAfter diagram.\n",
        )
        .expect("write mermaid");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        let doc = Document::open(&output).expect("open docx");
        let images = doc.images();
        assert_eq!(images.len(), 1);
        assert!(images[0].width_emu > 0);
        assert!(images[0].height_emu > 0);
        assert!(!images[0].is_anchor);

        let media = read_docx_media_names(Path::new(&output));
        assert!(media.iter().any(|name| name.ends_with(".png")));
        assert!(!media.iter().any(|name| name.ends_with(".svg")));

        let paragraphs = read_docx_paragraphs(Path::new(&output));
        assert!(paragraphs.iter().any(|text| text.contains("After diagram.")));
    }

    #[test]
    fn sanitize_mermaid_emojis_replaces_supported_symbols() {
        let sanitized = sanitize_mermaid_emojis("Done ✅ / Fail ❌ / Warn ⚠️ / Fire 🔥");
        assert_eq!(sanitized, "Done [done] / Fail [fail] / Warn [warning] / Fire [hot]");
    }

    #[test]
    fn sanitize_mermaid_emojis_reaches_the_renderer() {
        let sanitized = sanitize_mermaid_emojis("flowchart LR\n  A[✅ Ready] --> B[⚠️ Review]");
        let svg = render_with_options(&sanitized, RenderOptions::mermaid_default())
            .expect("render sanitized mermaid");

        assert!(svg.contains("[done]"));
        assert!(svg.contains("[warning]"));
        assert!(!svg.contains("✅"));
        assert!(!svg.contains("⚠"));
    }

    #[test]
    fn convert_markdown_to_docx_renders_checklists() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-checklist");
        fs::create_dir_all(workspace.join("_templates")).expect("templates");
        let source = workspace.join("checklist.md");
        fs::write(
            &source,
            "- [ ] Draft plan\n- [x] Review plan\n- [ ] Ship it\n",
        )
        .expect("write checklist");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        let paragraphs = read_docx_paragraphs(Path::new(&output));
        let joined = paragraphs.join("\n");
        assert!(joined.contains("Draft plan"));
        assert!(joined.contains("Review plan"));
        assert!(joined.contains("Ship it"));
        assert!(joined.contains("[ ] Draft plan"));
        assert!(joined.contains("[x] Review plan"));
        assert!(joined.contains("[ ] Ship it"));
    }

    #[test]
    fn convert_markdown_to_docx_renders_nested_checklists() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-nested-checklist");
        fs::create_dir_all(workspace.join("_templates")).expect("templates");
        let source = workspace.join("nested-checklist.md");
        fs::write(
            &source,
            "- [ ] Parent\n  - [x] Child\n  - [ ] Child two\n",
        )
        .expect("write nested checklist");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        let paragraphs = read_docx_paragraphs(Path::new(&output));
        let joined = paragraphs.join("\n");
        assert!(joined.contains("[ ] Parent"));
        assert!(joined.contains("[x] Child"));
        assert!(joined.contains("[ ] Child two"));
    }

    #[test]
    fn convert_markdown_to_docx_renders_frontmatter_as_key_value_table() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-frontmatter");
        fs::create_dir_all(workspace.join("_templates")).expect("templates");
        let source = workspace.join("frontmatter.md");
        fs::write(
            &source,
            "---\ntitle: Example\ntags: [One, Two]\ndraft: true\n---\n\nBody paragraph.\n",
        )
        .expect("write frontmatter");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        let (row_count, column_count, cells, headers, shadings, _) =
            read_docx_table(Path::new(&output));
        assert_eq!(row_count, 5);
        assert_eq!(column_count, 2);
        assert_eq!(headers, vec![true, false, false, false, false]);
        assert_eq!(
            cells,
            vec![
                vec!["Key".to_string(), "Value".to_string()],
                vec!["title".to_string(), "example".to_string()],
                vec!["tags".to_string(), "one".to_string()],
                vec!["tags".to_string(), "two".to_string()],
                vec!["draft".to_string(), "true".to_string()],
            ]
        );
        assert_eq!(shadings[0][0].as_deref(), Some(TABLE_HEADER_FILL));
        assert_eq!(shadings[0][1].as_deref(), Some(TABLE_HEADER_FILL));

        let paragraphs = read_docx_paragraphs(Path::new(&output));
        assert!(paragraphs.iter().any(|text| text.contains("Body paragraph.")));
    }

    #[test]
    fn convert_markdown_to_docx_uses_collision_suffix() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-collision");
        fs::create_dir_all(workspace.join("_templates")).expect("templates");
        let source = workspace.join("note.markdown");
        fs::write(&source, "# Title").expect("write note");
        fs::write(workspace.join("note.docx"), "occupied").expect("occupy output");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        assert!(output.ends_with("note (1).docx"));
        assert!(Path::new(&output).exists());
    }

    #[test]
    fn convert_markdown_to_docx_rejects_non_markdown() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-invalid");
        fs::create_dir_all(&workspace).expect("workspace");
        let source = workspace.join("note.txt");
        fs::write(&source, "text").expect("write text");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let result = convert_markdown_to_docx_sync(source.to_string_lossy().to_string());
        assert!(matches!(result, Err(AppError::InvalidPath)));
    }

    #[test]
    fn convert_markdown_to_docx_falls_back_when_template_is_invalid() {
        let _guard = workspace_test_guard();
        let workspace = create_temp_workspace("tomosona-docx-invalid-template");
        let templates = workspace.join("_templates");
        fs::create_dir_all(&templates).expect("templates");
        fs::write(templates.join("broken.docx"), "not a zip").expect("broken template");
        let source = workspace.join("note.md");
        fs::write(&source, "# Title").expect("write note");

        crate::set_active_workspace(&workspace.to_string_lossy()).expect("set workspace");
        let output = convert_markdown_to_docx_sync(source.to_string_lossy().to_string())
            .expect("convert");

        assert!(output.ends_with("note.docx"));
        assert!(Path::new(&output).exists());
    }
}
