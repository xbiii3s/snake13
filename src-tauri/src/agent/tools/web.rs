use async_trait::async_trait;
use serde_json::{json, Value};

use super::{PermissionLevel, Tool, ToolDefinition, ToolError, ToolOutput, ToolResult};

// ===========================================================================
// web_search
// ===========================================================================

pub struct WebSearch {
    client: reqwest::Client,
}

impl WebSearch {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("ClaudeDesktopPro/0.1")
                .build()
                .expect("Failed to build HTTP client"),
        }
    }
}

#[async_trait]
impl Tool for WebSearch {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_search".into(),
            description: "Search the web. Returns results with titles, URLs, and snippets.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "The search query." },
                    "max_results": { "type": "integer", "default": 10 }
                },
                "required": ["query"]
            }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Approval
    }

    async fn execute(&self, input: Value) -> ToolResult<ToolOutput> {
        let query = input["query"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput("'query' must be a string".into()))?;
        let max_results = input["max_results"].as_u64().unwrap_or(10);

        let url = format!(
            "https://api.duckduckgo.com/?q={}&format=json&no_html=1&no_redirect=1",
            urlencoding(query)
        );

        let response = self.client.get(&url).send().await.map_err(ToolError::Network)?;
        let status = response.status();
        if !status.is_success() {
            return Err(ToolError::ExecutionFailed(format!("Search API returned status {status}")));
        }

        let body: Value = response.json().await.map_err(ToolError::Network)?;
        let mut results = Vec::new();

        if let Some(abstract_text) = body["AbstractText"].as_str() {
            if !abstract_text.is_empty() {
                let source = body["AbstractSource"].as_str().unwrap_or("");
                let url = body["AbstractURL"].as_str().unwrap_or("");
                results.push(format!("[{source}] {abstract_text}\n  URL: {url}"));
            }
        }

        if let Some(topics) = body["RelatedTopics"].as_array() {
            for topic in topics.iter().take(max_results as usize) {
                if results.len() >= max_results as usize { break; }
                if let Some(text) = topic["Text"].as_str() {
                    let url = topic["FirstURL"].as_str().unwrap_or("");
                    results.push(format!("- {text}\n  URL: {url}"));
                }
            }
        }

        let output = if results.is_empty() {
            format!("No results found for query: \"{query}\"")
        } else {
            results.join("\n\n")
        };

        Ok(ToolOutput::with_metadata(output, json!({ "query": query, "result_count": results.len() })))
    }
}

fn urlencoding(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 3);
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

// ===========================================================================
// web_fetch
// ===========================================================================

pub struct WebFetch {
    client: reqwest::Client,
}

impl WebFetch {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .user_agent("ClaudeDesktopPro/0.1")
                .build()
                .expect("Failed to build HTTP client"),
        }
    }
}

#[async_trait]
impl Tool for WebFetch {
    fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: "web_fetch".into(),
            description: "Fetch the content of a URL.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "The URL to fetch." },
                    "method": { "type": "string", "default": "GET" },
                    "headers": { "type": "object", "additionalProperties": { "type": "string" } },
                    "body": { "type": "string" },
                    "max_bytes": { "type": "integer", "default": 1048576 }
                },
                "required": ["url"]
            }),
        }
    }

    fn permission_level(&self) -> PermissionLevel {
        PermissionLevel::Approval
    }

    async fn execute(&self, input: Value) -> ToolResult<ToolOutput> {
        let url = input["url"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput("'url' must be a string".into()))?;
        let method_str = input["method"].as_str().unwrap_or("GET");
        let max_bytes = input["max_bytes"].as_u64().unwrap_or(1_048_576) as usize;

        let method: reqwest::Method = method_str
            .parse()
            .map_err(|_| ToolError::InvalidInput(format!("Invalid HTTP method: {method_str}")))?;

        let mut request = self.client.request(method, url);

        if let Some(headers) = input["headers"].as_object() {
            for (key, val) in headers {
                if let Some(val_str) = val.as_str() {
                    let header_name: reqwest::header::HeaderName = key
                        .parse()
                        .map_err(|_| ToolError::InvalidInput(format!("Invalid header: {key}")))?;
                    request = request.header(header_name, val_str);
                }
            }
        }

        if let Some(body) = input["body"].as_str() {
            request = request.body(body.to_string());
        }

        let response = request.send().await.map_err(ToolError::Network)?;
        let status = response.status();
        let headers_map: serde_json::Map<String, Value> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), Value::String(v.to_str().unwrap_or("<binary>").to_string())))
            .collect();

        let bytes = response.bytes().await.map_err(ToolError::Network)?;
        let content = if bytes.len() > max_bytes {
            let truncated = String::from_utf8_lossy(&bytes[..max_bytes]).into_owned();
            format!("{truncated}\n\n--- truncated at {max_bytes} bytes ---")
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        };

        Ok(ToolOutput::with_metadata(
            content,
            json!({ "url": url, "status": status.as_u16(), "headers": headers_map, "size": bytes.len() }),
        ))
    }
}
