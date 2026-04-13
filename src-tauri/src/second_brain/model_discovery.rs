use std::collections::HashSet;

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredModel {
    pub id: String,
    pub display_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}

fn summarize_response_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return "<empty body>".to_string();
    }
    const MAX_CHARS: usize = 320;
    let mut summary = trimmed.chars().take(MAX_CHARS).collect::<String>();
    if trimmed.chars().count() > MAX_CHARS {
        summary.push_str("...");
    }
    summary
}

fn looks_like_model_id(value: &str) -> bool {
    if value.trim().is_empty() || value.len() > 120 {
        return false;
    }
    if value.chars().any(char::is_whitespace) {
        return false;
    }
    value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':' | '/'))
}

fn format_model_display_name(model_id: &str) -> String {
    let mut parts = Vec::new();
    for part in model_id.split('-') {
        let item = match part {
            "gpt" => "GPT".to_string(),
            "codex" => "Codex".to_string(),
            "mini" => "Mini".to_string(),
            "max" => "Max".to_string(),
            other => {
                if other.is_empty() {
                    continue;
                }
                let mut chars = other.chars();
                match chars.next() {
                    Some(first) => {
                        let mut chunk = String::new();
                        chunk.push(first.to_ascii_uppercase());
                        chunk.push_str(chars.as_str());
                        chunk
                    }
                    None => continue,
                }
            }
        };
        parts.push(item);
    }
    if parts.is_empty() {
        model_id.to_string()
    } else {
        parts.join(" ")
    }
}

fn normalize_model_display_name(model_id: &str, display_name: Option<&str>) -> String {
    let normalized = display_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(model_id);
    if normalized == model_id {
        return format_model_display_name(model_id);
    }
    normalized.to_string()
}

fn parse_string_array(value: Option<&Value>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn alias_display_name(alias: &str, canonical_id: &str, canonical_display_name: &str) -> String {
    format!("{alias} (alias of {canonical_display_name} [{canonical_id}])")
}

fn parse_model_entries(entry: &Value) -> Vec<DiscoveredModel> {
    let Some(object) = entry.as_object() else {
        return Vec::new();
    };
    let Some(model_id) = object
        .get("id")
        .or_else(|| object.get("slug"))
        .or_else(|| object.get("model"))
        .and_then(Value::as_str) else {
        return Vec::new();
    };
    if !looks_like_model_id(model_id) {
        return Vec::new();
    }
    let display_name = object
        .get("display_name")
        .or_else(|| object.get("displayName"))
        .or_else(|| object.get("name"))
        .or_else(|| object.get("title"))
        .and_then(Value::as_str);
    let canonical_display_name = normalize_model_display_name(model_id, display_name);
    let mut models = vec![DiscoveredModel {
        id: model_id.to_string(),
        display_name: canonical_display_name.clone(),
        group: None,
    }];
    let aliases = parse_string_array(object.get("aliases"))
        .into_iter()
        .chain(parse_string_array(object.get("alias")))
        .chain(parse_string_array(object.get("synonyms")))
        .collect::<Vec<_>>();
    let mut seen = HashSet::new();
    for alias in aliases {
        if alias == model_id || !looks_like_model_id(&alias) || !seen.insert(alias.clone()) {
            continue;
        }
        models.push(DiscoveredModel {
            id: alias.clone(),
            display_name: alias_display_name(&alias, model_id, &canonical_display_name),
            group: Some("Aliases".to_string()),
        });
    }
    models
}

fn collect_candidate_items<'a>(value: &'a Value, out: &mut Vec<&'a Value>) {
    match value {
        Value::Array(items) => out.extend(items),
        Value::Object(map) => {
            for key in ["models", "data", "items", "results", "available"] {
                if let Some(nested) = map.get(key) {
                    collect_candidate_items(nested, out);
                }
            }
        }
        _ => {}
    }
}

fn parse_models_payload(payload: &Value) -> Vec<DiscoveredModel> {
    let mut candidates = Vec::new();
    collect_candidate_items(payload, &mut candidates);
    let mut models = Vec::new();
    let mut seen = HashSet::new();
    for item in candidates {
        for model in parse_model_entries(item) {
            if seen.insert(model.id.clone()) {
                models.push(model);
            }
        }
    }
    models
}

pub async fn discover_models(endpoint: &str, api_key: &str) -> Result<Vec<DiscoveredModel>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(endpoint)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|err| format!("Model discovery request failed for {endpoint}: {err}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("Model discovery response read failed for {endpoint}: {err}"))?;
    if !status.is_success() {
        return Err(format!(
            "Model discovery failed for {endpoint}: HTTP {status}. Response body: {}",
            summarize_response_body(&body)
        ));
    }
    let payload: Value = serde_json::from_str(&body)
        .map_err(|err| {
            format!(
                "Model discovery returned invalid JSON for {endpoint}: {err}. Response body: {}",
                summarize_response_body(&body)
            )
        })?;
    let models = parse_models_payload(&payload);
    if models.is_empty() {
        return Err(format!(
            "Model discovery returned no models for {endpoint}. Response body: {}",
            summarize_response_body(&body)
        ));
    }
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_models_payload_reads_models_array() {
        let payload = serde_json::json!({
            "data": [
                { "id": "gpt-4.1", "display_name": "GPT-4.1", "aliases": ["gpt-4.1-mini"] },
                { "id": "gpt-5.2", "name": "GPT-5.2" }
            ]
        });
        let models = parse_models_payload(&payload);
        expect_eq(models.len(), 3);
        expect_eq(models[0].id.as_str(), "gpt-4.1");
        expect_eq(models[1].id.as_str(), "gpt-4.1-mini");
        expect_eq(models[1].group.as_deref(), Some("Aliases"));
        expect_eq(models[2].display_name.as_str(), "GPT-5.2");
    }

    #[test]
    fn parse_models_payload_dedupes_and_filters_invalid() {
        let payload = serde_json::json!({
            "models": [
                { "id": "gpt-5.2", "aliases": ["gpt-5.2-mini", "gpt-5.2-mini"] },
                { "id": "gpt-5.2" },
                { "id": "invalid model" },
                { "slug": "gpt-5.3", "title": "GPT-5.3" }
            ]
        });
        let models = parse_models_payload(&payload);
        expect_eq(models.len(), 3);
        expect_eq(models[0].id.as_str(), "gpt-5.2");
        expect_eq(models[1].id.as_str(), "gpt-5.2-mini");
        expect_eq(models[2].display_name.as_str(), "GPT-5.3");
    }

    #[test]
    fn parse_models_payload_accepts_openai_namespaced_model_ids() {
        let payload = serde_json::json!({
            "data": [
                { "object": "model", "id": "openai/gpt-oss-120b", "aliases": ["gpt-oss-120b"] },
                { "object": "model", "id": "openai/whisper-large-v3", "aliases": ["openweight-audio"] }
            ]
        });
        let models = parse_models_payload(&payload);
        expect_eq(models.len(), 4);
        expect_eq(models[0].id.as_str(), "openai/gpt-oss-120b");
        expect_eq(models[1].id.as_str(), "gpt-oss-120b");
        expect_eq(models[1].group.as_deref(), Some("Aliases"));
        expect_eq(models[2].id.as_str(), "openai/whisper-large-v3");
        expect_eq(models[3].id.as_str(), "openweight-audio");
    }

    #[test]
    fn summarizes_long_response_bodies() {
        let body = "a".repeat(400);
        let summary = summarize_response_body(&body);
        assert!(summary.len() <= 323);
        assert!(summary.ends_with("..."));
    }

    fn expect_eq<T: std::fmt::Debug + PartialEq>(left: T, right: T) {
        assert_eq!(left, right);
    }
}
