//! Workspace-scoped Alters persistence and prompt compilation.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::{
    ensure_index_schema, next_index_run_id, now_ms, normalize_workspace_relative_from_input, open_db,
    workspace_runtime::active_workspace_root, AppError, Result,
};
use crate::second_brain::config::active_profile;
use crate::second_brain::llm::run_llm;
use crate::settings;

const ALTER_PREFIX: &str = "alter";
const ALTER_REVISION_PREFIX: &str = "alter-rev";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AlterInspirationSourceType {
    Manual,
    Template,
    ReferenceFigure,
    Note,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlterInspiration {
    pub id: String,
    pub label: String,
    pub source_type: AlterInspirationSourceType,
    pub weight: Option<f64>,
    pub reference_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlterStyle {
    pub tone: String,
    pub verbosity: String,
    pub contradiction_level: i64,
    pub exploration_level: i64,
    pub influence_intensity: String,
    pub response_style: String,
    pub cite_hypotheses: bool,
    pub signal_biases: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlterRecord {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub category: Option<String>,
    pub mission: String,
    pub inspirations: Vec<AlterInspiration>,
    pub principles: Vec<String>,
    pub reflexes: Vec<String>,
    pub values: Vec<String>,
    pub critiques: Vec<String>,
    pub blind_spots: Vec<String>,
    pub system_hints: Vec<String>,
    pub style: AlterStyle,
    pub invocation_prompt: String,
    pub is_favorite: bool,
    pub is_built_in: bool,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlterSummary {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub category: Option<String>,
    pub mission: String,
    pub is_favorite: bool,
    pub is_built_in: bool,
    pub revision_count: usize,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlterRevisionSummary {
    pub revision_id: String,
    pub alter_id: String,
    pub created_at_ms: u64,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlterRevisionPayload {
    pub revision_id: String,
    pub alter_id: String,
    pub created_at_ms: u64,
    pub reason: Option<String>,
    #[serde(flatten)]
    pub alter: AlterRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAlterPayload {
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub category: Option<String>,
    pub mission: String,
    pub inspirations: Vec<AlterInspiration>,
    pub principles: Vec<String>,
    pub reflexes: Vec<String>,
    pub values: Vec<String>,
    pub critiques: Vec<String>,
    pub blind_spots: Vec<String>,
    pub system_hints: Vec<String>,
    pub style: AlterStyle,
    pub is_favorite: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateAlterPayload {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub category: Option<String>,
    pub mission: String,
    pub inspirations: Vec<AlterInspiration>,
    pub principles: Vec<String>,
    pub reflexes: Vec<String>,
    pub values: Vec<String>,
    pub critiques: Vec<String>,
    pub blind_spots: Vec<String>,
    pub system_hints: Vec<String>,
    pub style: AlterStyle,
    pub is_favorite: bool,
    pub revision_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PreviewAlterPayload {
    pub draft: CreateAlterPayload,
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateAlterDraftPayload {
    pub prompt: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PreviewAlterResult {
    pub invocation_prompt: String,
    pub preview_prompt: String,
}

#[derive(Debug, Clone, Deserialize)]
struct GeneratedAlterDraft {
    pub name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub category: Option<String>,
    pub mission: Option<String>,
    #[serde(default)]
    pub inspirations: Vec<GeneratedAlterInspiration>,
    #[serde(default)]
    pub principles: Vec<String>,
    #[serde(default)]
    pub reflexes: Vec<String>,
    #[serde(default)]
    pub values: Vec<String>,
    #[serde(default)]
    pub critiques: Vec<String>,
    #[serde(default)]
    pub blind_spots: Vec<String>,
    #[serde(default)]
    pub system_hints: Vec<String>,
    pub style: Option<GeneratedAlterStyle>,
    pub is_favorite: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct GeneratedAlterInspiration {
    pub label: Option<String>,
    pub source_type: Option<String>,
    pub weight: Option<f64>,
    pub reference_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GeneratedAlterStyle {
    pub tone: Option<String>,
    pub verbosity: Option<String>,
    pub contradiction_level: Option<i64>,
    pub exploration_level: Option<i64>,
    pub influence_intensity: Option<String>,
    pub response_style: Option<String>,
    pub cite_hypotheses: Option<bool>,
    pub signal_biases: Option<bool>,
}

fn next_id(prefix: &str) -> String {
    format!("{prefix}-{}-{}", now_ms(), next_index_run_id())
}

fn empty_to_none(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim().to_string();
        if trimmed.is_empty() { None } else { Some(trimmed) }
    })
}

fn sanitize_lines(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn default_style() -> AlterStyle {
    AlterStyle {
        tone: "strategic".to_string(),
        verbosity: "medium".to_string(),
        contradiction_level: 55,
        exploration_level: 60,
        influence_intensity: "balanced".to_string(),
        response_style: "analytic".to_string(),
        cite_hypotheses: true,
        signal_biases: true,
    }
}

fn slugify(name: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in name.trim().chars() {
        let next = if ch.is_ascii_alphanumeric() {
            ch.to_ascii_lowercase()
        } else {
            '-'
        };
        if next == '-' {
            if last_dash || slug.is_empty() {
                continue;
            }
            last_dash = true;
            slug.push('-');
            continue;
        }
        last_dash = false;
        slug.push(next);
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() { "alter".to_string() } else { slug }
}

fn normalize_generated_source_type(raw: Option<&str>) -> AlterInspirationSourceType {
    match raw.unwrap_or("").trim().to_lowercase().as_str() {
        "template" => AlterInspirationSourceType::Template,
        "reference_figure" | "reference figure" => AlterInspirationSourceType::ReferenceFigure,
        "note" => AlterInspirationSourceType::Note,
        _ => AlterInspirationSourceType::Manual,
    }
}

fn extract_json_object(raw: &str) -> Option<&str> {
    let start = raw.find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (offset, ch) in raw[start..].char_indices() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            if ch == '\\' {
                escaped = true;
                continue;
            }
            if ch == '"' {
                in_string = false;
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    let end = start + offset + ch.len_utf8();
                    return Some(&raw[start..end]);
                }
            }
            _ => {}
        }
    }

    None
}

fn fallback_name_from_prompt(prompt: &str) -> String {
    let compact = prompt
        .split_whitespace()
        .take(5)
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string();
    if compact.is_empty() {
        "Generated Alter".to_string()
    } else {
        compact
    }
}

fn normalize_generated_draft(parsed: GeneratedAlterDraft, prompt: &str) -> CreateAlterPayload {
    let fallback_name = fallback_name_from_prompt(prompt);
    let fallback_mission = format!(
        "When invoked, analyze requests using this intent: {}",
        prompt.trim()
    );
    let style = parsed.style.unwrap_or(GeneratedAlterStyle {
        tone: None,
        verbosity: None,
        contradiction_level: None,
        exploration_level: None,
        influence_intensity: None,
        response_style: None,
        cite_hypotheses: None,
        signal_biases: None,
    });
    let defaults = default_style();

    CreateAlterPayload {
        name: parsed.name.unwrap_or(fallback_name).trim().to_string(),
        description: parsed.description.unwrap_or_else(|| "Generated from a quick-start brief.".to_string()).trim().to_string(),
        icon: parsed.icon.and_then(|value| empty_to_none(Some(value))),
        color: parsed.color.and_then(|value| empty_to_none(Some(value))).or(Some("#8d6e63".to_string())),
        category: parsed.category.and_then(|value| empty_to_none(Some(value))),
        mission: parsed.mission.unwrap_or(fallback_mission).trim().to_string(),
        inspirations: parsed
            .inspirations
            .into_iter()
            .filter_map(|item| {
                let label = item.label.unwrap_or_default().trim().to_string();
                if label.is_empty() {
                    return None;
                }
                let reference_id = item.reference_id.and_then(|value| empty_to_none(Some(value)));
                let source_type = normalize_generated_source_type(item.source_type.as_deref());
                let safe_source_type = if matches!(source_type, AlterInspirationSourceType::Note) && reference_id.is_none() {
                    AlterInspirationSourceType::Manual
                } else {
                    source_type
                };
                Some(AlterInspiration {
                    id: String::new(),
                    label,
                    source_type: safe_source_type,
                    weight: item.weight,
                    reference_id,
                })
            })
            .collect(),
        principles: sanitize_lines(&parsed.principles),
        reflexes: sanitize_lines(&parsed.reflexes),
        values: sanitize_lines(&parsed.values),
        critiques: sanitize_lines(&parsed.critiques),
        blind_spots: sanitize_lines(&parsed.blind_spots),
        system_hints: sanitize_lines(&parsed.system_hints),
        style: AlterStyle {
            tone: style.tone.unwrap_or(defaults.tone).trim().to_string(),
            verbosity: style.verbosity.unwrap_or(defaults.verbosity).trim().to_string(),
            contradiction_level: style.contradiction_level.unwrap_or(defaults.contradiction_level),
            exploration_level: style.exploration_level.unwrap_or(defaults.exploration_level),
            influence_intensity: style
                .influence_intensity
                .unwrap_or(defaults.influence_intensity)
                .trim()
                .to_string(),
            response_style: style
                .response_style
                .unwrap_or(defaults.response_style)
                .trim()
                .to_string(),
            cite_hypotheses: style.cite_hypotheses.unwrap_or(defaults.cite_hypotheses),
            signal_biases: style.signal_biases.unwrap_or(defaults.signal_biases),
        },
        is_favorite: parsed.is_favorite.unwrap_or(false),
    }
}

fn validate_style(style: &AlterStyle) -> Result<()> {
    let valid_tones = ["neutral", "direct", "socratic", "strategic", "creative"];
    let valid_verbosity = ["short", "medium", "long"];
    let valid_intensity = ["light", "balanced", "strong"];
    let valid_response = ["concise", "analytic", "dialectic", "frontal"];
    if !valid_tones.contains(&style.tone.trim()) {
        return Err(AppError::InvalidOperation("Alter tone is invalid.".to_string()));
    }
    if !valid_verbosity.contains(&style.verbosity.trim()) {
        return Err(AppError::InvalidOperation("Alter verbosity is invalid.".to_string()));
    }
    if !valid_intensity.contains(&style.influence_intensity.trim()) {
        return Err(AppError::InvalidOperation("Alter intensity is invalid.".to_string()));
    }
    if !valid_response.contains(&style.response_style.trim()) {
        return Err(AppError::InvalidOperation("Alter response style is invalid.".to_string()));
    }
    if !(0..=100).contains(&style.contradiction_level) || !(0..=100).contains(&style.exploration_level) {
        return Err(AppError::InvalidOperation("Alter behavior levels must be between 0 and 100.".to_string()));
    }
    Ok(())
}

fn validate_inspirations(items: &[AlterInspiration]) -> Result<Vec<AlterInspiration>> {
    let root = active_workspace_root()?;
    let mut out = Vec::with_capacity(items.len());
    for item in items {
      let label = item.label.trim();
      if label.is_empty() {
        return Err(AppError::InvalidOperation("Alter inspiration label is required.".to_string()));
      }
      let reference_id = match item.source_type {
        AlterInspirationSourceType::Note => {
          let raw = item.reference_id.as_deref().unwrap_or("").trim();
          if raw.is_empty() {
            return Err(AppError::InvalidOperation("Note inspiration requires a note reference.".to_string()));
          }
          Some(normalize_workspace_relative_from_input(&root, raw)?)
        }
        _ => empty_to_none(item.reference_id.clone())
      };
      out.push(AlterInspiration {
        id: if item.id.trim().is_empty() { next_id("insp") } else { item.id.trim().to_string() },
        label: label.to_string(),
        source_type: item.source_type.clone(),
        weight: item.weight,
        reference_id
      });
    }
    Ok(out)
}

fn compile_invocation_prompt(record: &AlterRecord) -> String {
    let mut out = String::from("Alter invocation contract.\n");
    out.push_str(&format!("Identity: {}\n", record.name));
    if !record.description.trim().is_empty() {
        out.push_str(&format!("Description: {}\n", record.description.trim()));
    }
    out.push_str(&format!("Mission: {}\n", record.mission.trim()));
    if !record.inspirations.is_empty() {
        out.push_str("Inspirations:\n");
        for item in &record.inspirations {
            out.push_str(&format!("- {} ({:?})", item.label, item.source_type).to_lowercase());
            if let Some(weight) = item.weight {
                out.push_str(&format!(" weight={weight}"));
            }
            out.push('\n');
        }
    }
    for (label, values) in [
        ("Principles", &record.principles),
        ("Reflexes", &record.reflexes),
        ("Values", &record.values),
        ("Critiques", &record.critiques),
        ("Blind spots", &record.blind_spots),
    ] {
        if values.is_empty() {
            continue;
        }
        out.push_str(&format!("{label}:\n"));
        for value in values {
            out.push_str(&format!("- {value}\n"));
        }
    }
    out.push_str(&format!(
        "Style: tone={}, verbosity={}, contradiction_level={}, exploration_level={}, intensity={}, response_style={}\n",
        record.style.tone,
        record.style.verbosity,
        record.style.contradiction_level,
        record.style.exploration_level,
        record.style.influence_intensity,
        record.style.response_style
    ));
    if record.style.cite_hypotheses {
        out.push_str("Always cite hypotheses explicitly.\n");
    }
    if record.style.signal_biases {
        out.push_str("Signal potential biases and blind spots in the answer.\n");
    }
    if !record.system_hints.is_empty() {
        out.push_str("Hints:\n");
        for hint in &record.system_hints {
            out.push_str(&format!("- {hint}\n"));
        }
    }
    out.push_str("Respond in markdown and keep the Alter framing explicit but not theatrical.");
    out
}

fn normalize_create_payload(payload: CreateAlterPayload, existing_id: Option<String>, created_at_ms: Option<u64>) -> Result<AlterRecord> {
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::InvalidOperation("Alter name is required.".to_string()));
    }
    let mission = payload.mission.trim().to_string();
    if mission.is_empty() {
        return Err(AppError::InvalidOperation("Alter mission is required.".to_string()));
    }
    validate_style(&payload.style)?;
    let ts = now_ms();
    let inspirations = validate_inspirations(&payload.inspirations)?;
    let mut record = AlterRecord {
        id: existing_id.unwrap_or_else(|| next_id(ALTER_PREFIX)),
        name: name.clone(),
        slug: slugify(&name),
        description: payload.description.trim().to_string(),
        icon: empty_to_none(payload.icon),
        color: empty_to_none(payload.color),
        category: empty_to_none(payload.category),
        mission,
        inspirations,
        principles: sanitize_lines(&payload.principles),
        reflexes: sanitize_lines(&payload.reflexes),
        values: sanitize_lines(&payload.values),
        critiques: sanitize_lines(&payload.critiques),
        blind_spots: sanitize_lines(&payload.blind_spots),
        system_hints: sanitize_lines(&payload.system_hints),
        style: payload.style,
        invocation_prompt: String::new(),
        is_favorite: payload.is_favorite,
        is_built_in: false,
        created_at_ms: created_at_ms.unwrap_or(ts),
        updated_at_ms: ts,
    };
    record.invocation_prompt = compile_invocation_prompt(&record);
    Ok(record)
}

fn write_inspirations(conn: &Connection, alter_id: &str, inspirations: &[AlterInspiration]) -> Result<()> {
    conn.execute("DELETE FROM alter_inspirations WHERE alter_id = ?1", params![alter_id])?;
    for (index, item) in inspirations.iter().enumerate() {
        conn.execute(
            "INSERT INTO alter_inspirations (alter_id, inspiration_id, label, source_type, weight, reference_id, sort_order)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                alter_id,
                item.id,
                item.label,
                serde_json::to_string(&item.source_type).unwrap_or_else(|_| "\"manual\"".to_string()).replace('\"', ""),
                item.weight,
                item.reference_id,
                index as i64
            ],
        )?;
    }
    Ok(())
}

fn insert_revision(conn: &Connection, alter: &AlterRecord, reason: Option<&str>) -> Result<()> {
    let revision_id = next_id(ALTER_REVISION_PREFIX);
    let snapshot = serde_json::to_string(alter).map_err(|_| AppError::OperationFailed)?;
    conn.execute(
        "INSERT INTO alter_revisions (revision_id, alter_id, snapshot_json, reason, created_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![revision_id, alter.id, snapshot, reason.unwrap_or(""), now_ms() as i64],
    )?;
    Ok(())
}

fn upsert_alter(conn: &Connection, alter: &AlterRecord, reason: Option<&str>) -> Result<()> {
    conn.execute(
        "INSERT INTO alters (
            id, name, slug, description, icon, color, category, mission,
            principles_json, reflexes_json, values_json, critiques_json, blind_spots_json,
            system_hints_json, style_json, invocation_prompt, is_favorite, is_built_in,
            created_at_ms, updated_at_ms
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
            ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
         )
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           slug = excluded.slug,
           description = excluded.description,
           icon = excluded.icon,
           color = excluded.color,
           category = excluded.category,
           mission = excluded.mission,
           principles_json = excluded.principles_json,
           reflexes_json = excluded.reflexes_json,
           values_json = excluded.values_json,
           critiques_json = excluded.critiques_json,
           blind_spots_json = excluded.blind_spots_json,
           system_hints_json = excluded.system_hints_json,
           style_json = excluded.style_json,
           invocation_prompt = excluded.invocation_prompt,
           is_favorite = excluded.is_favorite,
           is_built_in = excluded.is_built_in,
           updated_at_ms = excluded.updated_at_ms",
        params![
            alter.id,
            alter.name,
            alter.slug,
            alter.description,
            alter.icon.clone().unwrap_or_default(),
            alter.color.clone().unwrap_or_default(),
            alter.category.clone().unwrap_or_default(),
            alter.mission,
            serde_json::to_string(&alter.principles).map_err(|_| AppError::OperationFailed)?,
            serde_json::to_string(&alter.reflexes).map_err(|_| AppError::OperationFailed)?,
            serde_json::to_string(&alter.values).map_err(|_| AppError::OperationFailed)?,
            serde_json::to_string(&alter.critiques).map_err(|_| AppError::OperationFailed)?,
            serde_json::to_string(&alter.blind_spots).map_err(|_| AppError::OperationFailed)?,
            serde_json::to_string(&alter.system_hints).map_err(|_| AppError::OperationFailed)?,
            serde_json::to_string(&alter.style).map_err(|_| AppError::OperationFailed)?,
            alter.invocation_prompt,
            if alter.is_favorite { 1 } else { 0 },
            if alter.is_built_in { 1 } else { 0 },
            alter.created_at_ms as i64,
            alter.updated_at_ms as i64
        ],
    )?;
    write_inspirations(conn, &alter.id, &alter.inspirations)?;
    insert_revision(conn, alter, reason)?;
    Ok(())
}

fn parse_json_vec(raw: String) -> Vec<String> {
    serde_json::from_str(&raw).unwrap_or_default()
}

fn load_inspirations(conn: &Connection, alter_id: &str) -> Result<Vec<AlterInspiration>> {
    let mut stmt = conn.prepare(
        "SELECT inspiration_id, label, source_type, weight, reference_id
         FROM alter_inspirations WHERE alter_id = ?1 ORDER BY sort_order ASC"
    )?;
    let rows = stmt.query_map(params![alter_id], |row| {
        let source_type_raw = row.get::<_, String>(2)?;
        let source_type = match source_type_raw.as_str() {
            "manual" => AlterInspirationSourceType::Manual,
            "template" => AlterInspirationSourceType::Template,
            "reference_figure" => AlterInspirationSourceType::ReferenceFigure,
            "note" => AlterInspirationSourceType::Note,
            _ => AlterInspirationSourceType::Manual,
        };
        Ok(AlterInspiration {
            id: row.get(0)?,
            label: row.get(1)?,
            source_type,
            weight: row.get(3)?,
            reference_id: row.get(4)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn load_alter_record(conn: &Connection, alter_id: &str) -> Result<AlterRecord> {
    let row = conn.query_row(
        "SELECT id, name, slug, description, icon, color, category, mission,
                principles_json, reflexes_json, values_json, critiques_json, blind_spots_json,
                system_hints_json, style_json, invocation_prompt, is_favorite, is_built_in,
                created_at_ms, updated_at_ms
         FROM alters WHERE id = ?1",
        params![alter_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, String>(14)?,
                row.get::<_, String>(15)?,
                row.get::<_, i64>(16)?,
                row.get::<_, i64>(17)?,
                row.get::<_, i64>(18)? as u64,
                row.get::<_, i64>(19)? as u64,
            ))
        },
    ).map_err(|_| AppError::InvalidOperation("Alter not found.".to_string()))?;
    let style: AlterStyle = serde_json::from_str(&row.14).map_err(|_| AppError::OperationFailed)?;
    Ok(AlterRecord {
        id: row.0,
        name: row.1,
        slug: row.2,
        description: row.3,
        icon: empty_to_none(Some(row.4)),
        color: empty_to_none(Some(row.5)),
        category: empty_to_none(Some(row.6)),
        mission: row.7,
        inspirations: load_inspirations(conn, alter_id)?,
        principles: parse_json_vec(row.8),
        reflexes: parse_json_vec(row.9),
        values: parse_json_vec(row.10),
        critiques: parse_json_vec(row.11),
        blind_spots: parse_json_vec(row.12),
        system_hints: parse_json_vec(row.13),
        style,
        invocation_prompt: row.15,
        is_favorite: row.16 != 0,
        is_built_in: row.17 != 0,
        created_at_ms: row.18,
        updated_at_ms: row.19,
    })
}

pub fn resolve_invocation_prompt(conn: &Connection, alter_id: Option<&str>) -> Result<Option<String>> {
    let Some(alter_id) = alter_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let alter = load_alter_record(conn, alter_id)?;
    Ok(Some(alter.invocation_prompt))
}

fn quick_start_system_prompt() -> &'static str {
    "You design structured Alter personas for a workspace-centric thinking tool.

Return exactly one JSON object and nothing else.
Do not wrap in markdown fences.
Generate a pragmatic, usable Alter configuration from the user's brief.

Required JSON shape:
{
  \"name\": string,
  \"description\": string,
  \"icon\": null,
  \"color\": string,
  \"category\": string,
  \"mission\": string,
  \"inspirations\": [{\"label\": string, \"source_type\": \"manual\" | \"template\" | \"reference_figure\" | \"note\", \"weight\": number | null, \"reference_id\": string | null}],
  \"principles\": string[],
  \"reflexes\": string[],
  \"values\": string[],
  \"critiques\": string[],
  \"blind_spots\": string[],
  \"system_hints\": string[],
  \"style\": {
    \"tone\": \"neutral\" | \"direct\" | \"socratic\" | \"strategic\" | \"creative\",
    \"verbosity\": \"short\" | \"medium\" | \"long\",
    \"contradiction_level\": number,
    \"exploration_level\": number,
    \"influence_intensity\": \"light\" | \"balanced\" | \"strong\",
    \"response_style\": \"concise\" | \"analytic\" | \"dialectic\" | \"frontal\",
    \"cite_hypotheses\": boolean,
    \"signal_biases\": boolean
  },
  \"is_favorite\": boolean
}

Constraints:
- Make the name compact and product-ready.
- Generate category, description, and mission automatically.
- Prefer 3 to 6 items for each list when relevant.
- Keep inspirations concrete and use reference_figure/manual unless the user explicitly implies a note.
- Use null for unknown optional values.
- Keep contradiction_level and exploration_level between 0 and 100."
}

fn quick_start_user_prompt(prompt: &str) -> String {
    format!(
        "User brief for the Alter quick start:\n{}\n\nGenerate the full Alter JSON now.",
        prompt.trim()
    )
}

#[tauri::command]
pub async fn generate_alter_draft(payload: GenerateAlterDraftPayload) -> Result<CreateAlterPayload> {
    let normalized_prompt = payload.prompt.trim().to_string();
    if normalized_prompt.is_empty() {
        return Err(AppError::InvalidOperation(
            "Quick start prompt is required.".to_string(),
        ));
    }

    let config = settings::load_llm_for_runtime().map_err(|err| {
        if matches!(err, AppError::InvalidOperation(_)) {
            err
        } else {
            AppError::InvalidOperation("Second Brain configuration is unavailable.".to_string())
        }
    })?;
    let active = active_profile(&config).ok_or_else(|| {
        AppError::InvalidOperation("active profile is missing from config.".to_string())
    })?;
    if !active.capabilities.text {
        return Err(AppError::InvalidOperation(
            "The active profile does not support text generation.".to_string(),
        ));
    }

    let raw = run_llm(active, quick_start_system_prompt(), &quick_start_user_prompt(&normalized_prompt))
        .await
        .map_err(AppError::InvalidOperation)?;
    let json = extract_json_object(&raw).ok_or_else(|| {
        AppError::InvalidOperation("Could not parse Alter quick start response.".to_string())
    })?;
    let parsed: GeneratedAlterDraft = serde_json::from_str(json).map_err(|_| {
        AppError::InvalidOperation("Alter quick start returned invalid JSON.".to_string())
    })?;
    Ok(normalize_generated_draft(parsed, &normalized_prompt))
}

#[tauri::command]
pub fn list_alters() -> Result<Vec<AlterSummary>> {
    let conn = open_db()?;
    ensure_index_schema(&conn)?;
    let mut stmt = conn.prepare(
        "SELECT a.id, a.name, a.slug, a.description, a.icon, a.color, a.category, a.mission,
                a.is_favorite, a.is_built_in, a.updated_at_ms,
                (SELECT COUNT(*) FROM alter_revisions r WHERE r.alter_id = a.id)
         FROM alters a
         ORDER BY a.is_favorite DESC, a.updated_at_ms DESC, a.name ASC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AlterSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            slug: row.get(2)?,
            description: row.get(3)?,
            icon: empty_to_none(Some(row.get::<_, String>(4)?)),
            color: empty_to_none(Some(row.get::<_, String>(5)?)),
            category: empty_to_none(Some(row.get::<_, String>(6)?)),
            mission: row.get(7)?,
            is_favorite: row.get::<_, i64>(8)? != 0,
            is_built_in: row.get::<_, i64>(9)? != 0,
            updated_at_ms: row.get::<_, i64>(10)? as u64,
            revision_count: row.get::<_, i64>(11)? as usize,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[tauri::command]
pub fn create_alter(payload: CreateAlterPayload) -> Result<AlterRecord> {
    let conn = open_db()?;
    ensure_index_schema(&conn)?;
    let alter = normalize_create_payload(payload, None, None)?;
    upsert_alter(&conn, &alter, Some("created"))?;
    Ok(alter)
}

#[tauri::command]
pub fn load_alter(alter_id: String) -> Result<AlterRecord> {
    let conn = open_db()?;
    ensure_index_schema(&conn)?;
    load_alter_record(&conn, &alter_id)
}

#[tauri::command]
pub fn update_alter(payload: UpdateAlterPayload) -> Result<AlterRecord> {
    let conn = open_db()?;
    ensure_index_schema(&conn)?;
    let current = load_alter_record(&conn, &payload.id)?;
    let alter = normalize_create_payload(
        CreateAlterPayload {
            name: payload.name,
            description: payload.description,
            icon: payload.icon,
            color: payload.color,
            category: payload.category,
            mission: payload.mission,
            inspirations: payload.inspirations,
            principles: payload.principles,
            reflexes: payload.reflexes,
            values: payload.values,
            critiques: payload.critiques,
            blind_spots: payload.blind_spots,
            system_hints: payload.system_hints,
            style: payload.style,
            is_favorite: payload.is_favorite,
        },
        Some(current.id.clone()),
        Some(current.created_at_ms),
    )?;
    upsert_alter(&conn, &alter, payload.revision_reason.as_deref())?;
    Ok(alter)
}

#[tauri::command]
pub fn delete_alter(alter_id: String) -> Result<()> {
    let conn = open_db()?;
    ensure_index_schema(&conn)?;
    conn.execute("UPDATE second_brain_sessions SET alter_id = '' WHERE alter_id = ?1", params![alter_id.clone()])?;
    conn.execute("DELETE FROM alter_inspirations WHERE alter_id = ?1", params![alter_id.clone()])?;
    conn.execute("DELETE FROM alter_revisions WHERE alter_id = ?1", params![alter_id.clone()])?;
    conn.execute("DELETE FROM alters WHERE id = ?1", params![alter_id])?;
    Ok(())
}

#[tauri::command]
pub fn duplicate_alter(alter_id: String) -> Result<AlterRecord> {
    let conn = open_db()?;
    ensure_index_schema(&conn)?;
    let current = load_alter_record(&conn, &alter_id)?;
    let mut clone = current.clone();
    clone.id = next_id(ALTER_PREFIX);
    clone.name = format!("{} Copy", current.name);
    clone.slug = slugify(&clone.name);
    clone.is_built_in = false;
    clone.created_at_ms = now_ms();
    clone.updated_at_ms = clone.created_at_ms;
    clone.invocation_prompt = compile_invocation_prompt(&clone);
    upsert_alter(&conn, &clone, Some("duplicated"))?;
    Ok(clone)
}

#[tauri::command]
pub fn list_alter_revisions(alter_id: String) -> Result<Vec<AlterRevisionSummary>> {
    let conn = open_db()?;
    ensure_index_schema(&conn)?;
    let mut stmt = conn.prepare(
        "SELECT revision_id, alter_id, created_at_ms, reason
         FROM alter_revisions WHERE alter_id = ?1 ORDER BY created_at_ms DESC"
    )?;
    let rows = stmt.query_map(params![alter_id], |row| {
        Ok(AlterRevisionSummary {
            revision_id: row.get(0)?,
            alter_id: row.get(1)?,
            created_at_ms: row.get::<_, i64>(2)? as u64,
            reason: empty_to_none(Some(row.get::<_, String>(3)?)),
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[tauri::command]
pub fn load_alter_revision(revision_id: String) -> Result<AlterRevisionPayload> {
    let conn = open_db()?;
    ensure_index_schema(&conn)?;
    let row = conn.query_row(
        "SELECT revision_id, alter_id, snapshot_json, reason, created_at_ms
         FROM alter_revisions WHERE revision_id = ?1",
        params![revision_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)? as u64,
            ))
        },
    ).map_err(|_| AppError::InvalidOperation("Alter revision not found.".to_string()))?;
    let alter: AlterRecord = serde_json::from_str(&row.2).map_err(|_| AppError::OperationFailed)?;
    Ok(AlterRevisionPayload {
        revision_id: row.0,
        alter_id: row.1,
        created_at_ms: row.4,
        reason: empty_to_none(Some(row.3)),
        alter,
    })
}

#[tauri::command]
pub fn preview_alter(payload: PreviewAlterPayload) -> Result<PreviewAlterResult> {
    let record = normalize_create_payload(payload.draft, Some("preview".to_string()), Some(now_ms()))?;
    let preview_prompt = format!(
        "{}\n\nPrompt utilisateur de test:\n{}\n\nReponds comme cet Alter.",
        record.invocation_prompt,
        payload.prompt.trim()
    );
    Ok(PreviewAlterResult {
        invocation_prompt: record.invocation_prompt,
        preview_prompt,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_json_object_accepts_fenced_or_prefixed_output() {
        let raw = "```json\n{\"name\":\"A\"}\n```";
        assert_eq!(extract_json_object(raw), Some("{\"name\":\"A\"}"));
    }

    #[test]
    fn normalize_generated_draft_fills_missing_defaults() {
        let draft = normalize_generated_draft(
            GeneratedAlterDraft {
                name: None,
                description: None,
                icon: None,
                color: None,
                category: None,
                mission: None,
                inspirations: vec![],
                principles: vec!["Prefer robustness".to_string()],
                reflexes: vec![],
                values: vec![],
                critiques: vec![],
                blind_spots: vec![],
                system_hints: vec![],
                style: None,
                is_favorite: None,
            },
            "Build an alter for strategy under uncertainty",
        );

        assert!(!draft.name.trim().is_empty());
        assert!(draft.mission.contains("Build an alter for strategy under uncertainty"));
        assert_eq!(draft.style.influence_intensity, "balanced");
        assert_eq!(draft.color.as_deref(), Some("#8d6e63"));
    }
}
