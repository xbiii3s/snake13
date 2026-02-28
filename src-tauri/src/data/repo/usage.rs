use rusqlite::{params, Connection};
use serde::Serialize;

use crate::error::AppResult;

#[derive(Debug, Serialize)]
pub struct UsageStat {
    pub date: String,
    pub model_id: String,
    pub source: String,
    pub tokens_in: i64,
    pub tokens_out: i64,
    pub cost: f64,
    pub request_count: i64,
}

#[derive(Debug, Serialize)]
pub struct UsageSummary {
    pub total_tokens_in: i64,
    pub total_tokens_out: i64,
    pub total_cost: f64,
    pub total_requests: i64,
    pub by_model: Vec<UsageStat>,
}

pub struct UsageRepo;

impl UsageRepo {
    /// Record usage for a request
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

    /// Get usage summary for a date range
    pub fn get_summary(
        conn: &Connection,
        from_date: &str,
        to_date: &str,
    ) -> AppResult<UsageSummary> {
        let mut stmt = conn.prepare(
            "SELECT model_id, source,
                    SUM(tokens_in) as total_in,
                    SUM(tokens_out) as total_out,
                    SUM(cost) as total_cost,
                    SUM(request_count) as total_requests
             FROM usage_stats
             WHERE date >= ?1 AND date <= ?2
             GROUP BY model_id, source
             ORDER BY total_cost DESC",
        )?;

        let rows = stmt.query_map(params![from_date, to_date], |row| {
            Ok(UsageStat {
                date: String::new(),
                model_id: row.get(0)?,
                source: row.get(1)?,
                tokens_in: row.get(2)?,
                tokens_out: row.get(3)?,
                cost: row.get(4)?,
                request_count: row.get(5)?,
            })
        })?;

        let mut by_model = Vec::new();
        let mut total_in = 0i64;
        let mut total_out = 0i64;
        let mut total_cost = 0.0f64;
        let mut total_requests = 0i64;

        for row in rows {
            let stat = row?;
            total_in += stat.tokens_in;
            total_out += stat.tokens_out;
            total_cost += stat.cost;
            total_requests += stat.request_count;
            by_model.push(stat);
        }

        Ok(UsageSummary {
            total_tokens_in: total_in,
            total_tokens_out: total_out,
            total_cost,
            total_requests,
            by_model,
        })
    }

    /// Get daily usage for a date range
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
