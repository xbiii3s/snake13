use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct UsageStat {
    pub date: String,
    pub model_id: String,
    pub source: String,
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub cost: f64,
    pub request_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageSummary {
    pub model_id: String,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost: f64,
    pub message_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyUsage {
    pub date: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost: f64,
}

pub struct UsageRepo;

impl UsageRepo {
    /// Record usage for a request (aggregates by date/model/source)
    pub fn record(
        conn: &Connection,
        model_id: &str,
        source: &str,
        tokens_in: i64,
        tokens_out: i64,
        cost: f64,
    ) -> AppResult<()> {
        conn.execute(
            "INSERT INTO usage_stats (date, model_id, source, tokens_in, tokens_out, cost, request_count)
             VALUES (date('now'), ?1, ?2, ?3, ?4, ?5, 1)
             ON CONFLICT(date, model_id, source) DO UPDATE SET
                tokens_in = tokens_in + excluded.tokens_in,
                tokens_out = tokens_out + excluded.tokens_out,
                cost = cost + excluded.cost,
                request_count = request_count + 1",
            params![model_id, source, tokens_in, tokens_out, cost],
        )?;
        Ok(())
    }

    /// Record usage for a conversation message
    pub fn record_message(
        conn: &Connection,
        _conversation_id: &str,
        model_id: &str,
        input_tokens: i64,
        output_tokens: i64,
        cost: f64,
    ) -> AppResult<()> {
        Self::record(conn, model_id, "chat", input_tokens, output_tokens, cost)
    }

    /// Get summary grouped by model for a date range
    pub fn summary_by_model(
        conn: &Connection,
        from_date: &str,
        to_date: &str,
    ) -> AppResult<Vec<UsageSummary>> {
        let mut stmt = conn.prepare(
            "SELECT model_id, SUM(tokens_in), SUM(tokens_out), SUM(cost), SUM(request_count)
             FROM usage_stats
             WHERE date >= ?1 AND date <= ?2
             GROUP BY model_id
             ORDER BY SUM(cost) DESC",
        )?;

        let rows = stmt.query_map(params![from_date, to_date], |row| {
            Ok(UsageSummary {
                model_id: row.get(0)?,
                total_input_tokens: row.get(1)?,
                total_output_tokens: row.get(2)?,
                total_cost: row.get(3)?,
                message_count: row.get(4)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    /// Get daily usage for a date range (aggregated across all models)
    pub fn daily_usage(
        conn: &Connection,
        from_date: &str,
        to_date: &str,
    ) -> AppResult<Vec<DailyUsage>> {
        let mut stmt = conn.prepare(
            "SELECT date, SUM(tokens_in), SUM(tokens_out), SUM(cost)
             FROM usage_stats
             WHERE date >= ?1 AND date <= ?2
             GROUP BY date
             ORDER BY date ASC",
        )?;

        let rows = stmt.query_map(params![from_date, to_date], |row| {
            Ok(DailyUsage {
                date: row.get(0)?,
                input_tokens: row.get(1)?,
                output_tokens: row.get(2)?,
                cost: row.get(3)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    /// Get total usage stats across all time
    pub fn total(conn: &Connection) -> AppResult<UsageSummary> {
        let mut stmt = conn.prepare(
            "SELECT COALESCE(SUM(tokens_in), 0), COALESCE(SUM(tokens_out), 0), COALESCE(SUM(cost), 0.0), COALESCE(SUM(request_count), 0) FROM usage_stats",
        )?;
        let summary = stmt.query_row([], |row| {
            Ok(UsageSummary {
                model_id: "all".to_string(),
                total_input_tokens: row.get(0)?,
                total_output_tokens: row.get(1)?,
                total_cost: row.get(2)?,
                message_count: row.get(3)?,
            })
        })?;
        Ok(summary)
    }

    /// Get usage summary for a date range (legacy API)
    #[allow(dead_code)]
    pub fn get_summary(
        conn: &Connection,
        from_date: &str,
        to_date: &str,
    ) -> AppResult<UsageSummary> {
        let mut stmt = conn.prepare(
            "SELECT COALESCE(SUM(tokens_in), 0), COALESCE(SUM(tokens_out), 0), COALESCE(SUM(cost), 0.0), COALESCE(SUM(request_count), 0)
             FROM usage_stats
             WHERE date >= ?1 AND date <= ?2",
        )?;

        let summary = stmt.query_row(params![from_date, to_date], |row| {
            Ok(UsageSummary {
                model_id: "all".to_string(),
                total_input_tokens: row.get(0)?,
                total_output_tokens: row.get(1)?,
                total_cost: row.get(2)?,
                message_count: row.get(3)?,
            })
        })?;

        Ok(summary)
    }

    /// Get daily usage for a date range (legacy API returning raw stats)
    #[allow(dead_code)]
    pub fn get_daily(
        conn: &Connection,
        from_date: &str,
        to_date: &str,
    ) -> AppResult<Vec<UsageStat>> {
        let mut stmt = conn.prepare(
            "SELECT date, model_id, source, tokens_in, tokens_out, cost, request_count
             FROM usage_stats
             WHERE date >= ?1 AND date <= ?2
             ORDER BY date ASC",
        )?;

        let rows = stmt.query_map(params![from_date, to_date], |row| {
            Ok(UsageStat {
                date: row.get(0)?,
                model_id: row.get(1)?,
                source: row.get(2)?,
                tokens_in: row.get(3)?,
                tokens_out: row.get(4)?,
                cost: row.get(5)?,
                request_count: row.get(6)?,
            })
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::test_connection;

    #[test]
    fn test_record_and_total() {
        let conn = test_connection();
        UsageRepo::record(&conn, "claude-sonnet-4-5", "chat", 100, 200, 0.003).unwrap();
        UsageRepo::record(&conn, "claude-opus-4-6", "chat", 500, 300, 0.03).unwrap();
        let total = UsageRepo::total(&conn).unwrap();
        assert_eq!(total.total_input_tokens, 600);
        assert_eq!(total.total_output_tokens, 500);
        assert_eq!(total.message_count, 2);
    }

    #[test]
    fn test_summary_by_model() {
        let conn = test_connection();
        UsageRepo::record(&conn, "claude-sonnet-4-5", "chat", 100, 200, 0.003).unwrap();
        UsageRepo::record(&conn, "claude-sonnet-4-5", "chat", 150, 250, 0.004).unwrap();
        UsageRepo::record(&conn, "claude-opus-4-6", "chat", 500, 300, 0.03).unwrap();
        let summary = UsageRepo::summary_by_model(&conn, "2020-01-01", "2030-12-31").unwrap();
        assert_eq!(summary.len(), 2);
        // Opus should be first (higher cost)
        assert_eq!(summary[0].model_id, "claude-opus-4-6");
        assert_eq!(summary[0].total_input_tokens, 500);
        // Sonnet aggregated
        assert_eq!(summary[1].model_id, "claude-sonnet-4-5");
        assert_eq!(summary[1].total_input_tokens, 250);
        assert_eq!(summary[1].total_output_tokens, 450);
        assert_eq!(summary[1].message_count, 2);
    }

    #[test]
    fn test_empty_total() {
        let conn = test_connection();
        let total = UsageRepo::total(&conn).unwrap();
        assert_eq!(total.total_input_tokens, 0);
        assert_eq!(total.message_count, 0);
    }

    #[test]
    fn test_daily_usage() {
        let conn = test_connection();
        UsageRepo::record(&conn, "claude-sonnet-4-5", "chat", 100, 200, 0.003).unwrap();
        UsageRepo::record(&conn, "claude-opus-4-6", "chat", 500, 300, 0.03).unwrap();
        let daily = UsageRepo::daily_usage(&conn, "2020-01-01", "2030-12-31").unwrap();
        // Both records are on the same day (today), so should be 1 daily entry
        assert_eq!(daily.len(), 1);
        assert_eq!(daily[0].input_tokens, 600);
        assert_eq!(daily[0].output_tokens, 500);
    }

    #[test]
    fn test_record_message() {
        let conn = test_connection();
        UsageRepo::record_message(&conn, "conv1", "claude-sonnet-4-5", 100, 200, 0.003).unwrap();
        let total = UsageRepo::total(&conn).unwrap();
        assert_eq!(total.total_input_tokens, 100);
        assert_eq!(total.total_output_tokens, 200);
        assert_eq!(total.message_count, 1);
    }
}
