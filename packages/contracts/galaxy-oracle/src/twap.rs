//! Time-Weighted Average Price (TWAP) computation algorithms.

use super::types::PriceEntry;
use soroban_sdk::Vec;

/// Compute TWAP over the entire recorded observation slice.
///
/// TWAP = Σ(price_i × Δt_i) / Σ(Δt_i)
///
/// `history` MUST be sorted oldest-to-newest and contain at least 2 entries.
pub fn compute_twap(history: &Vec<PriceEntry>, now: u64) -> i128 {
    let len = history.len();

    let mut weighted_sum: i128 = 0;
    let mut total_dt: u64 = 0;

    for i in 0..len {
        let entry = history.get(i).unwrap();
        let next_timestamp = if i + 1 < len {
            history.get(i + 1).unwrap().timestamp
        } else {
            now
        };

        let dt = next_timestamp.saturating_sub(entry.timestamp);
        if dt > 0 {
            weighted_sum += entry.price.saturating_mul(dt as i128);
            total_dt += dt;
        }
    }

    if total_dt == 0 {
        // All observations share the exact same timestamp; fallback to last price
        return history.get(len - 1).unwrap().price;
    }

    weighted_sum / (total_dt as i128)
}

/// Compute TWAP strictly within `[window_start, now]`.
///
/// Handles partial windows gracefully:
/// - If no observations fall within the window, but an earlier observation
///   exists, treats that observation as held constant throughout the window.
/// - Observations before `window_start` are clamped to `window_start`.
pub fn compute_twap_window(history: &Vec<PriceEntry>, now: u64, window_start: u64) -> i128 {
    let len = history.len();

    // Find the most recent observation that occurred at or before window_start
    let mut prev_price: Option<i128> = None;
    let mut i = 0;
    while i < len {
        let entry = history.get(i).unwrap();
        if entry.timestamp <= window_start {
            prev_price = Some(entry.price);
            i += 1;
        } else {
            break;
        }
    }

    let mut weighted_sum: i128 = 0;
    let mut total_dt: u64 = 0;

    // Segment 1: from window_start to the first observation strictly INSIDE the window
    if i < len {
        let first_inside = history.get(i).unwrap();
        let dt = first_inside.timestamp.saturating_sub(window_start);
        if dt > 0 {
            let p = prev_price.unwrap_or(first_inside.price);
            weighted_sum += p.saturating_mul(dt as i128);
            total_dt += dt;
        }
    } else {
        // All observations are <= window_start: whole window takes the latest price
        return prev_price.unwrap_or_else(|| history.get(len - 1).unwrap().price);
    }

    // Segment 2: observations inside the window
    while i < len {
        let entry = history.get(i).unwrap();
        let next_t = if i + 1 < len {
            history.get(i + 1).unwrap().timestamp
        } else {
            now
        };

        let dt = next_t.saturating_sub(entry.timestamp);
        if dt > 0 {
            weighted_sum += entry.price.saturating_mul(dt as i128);
            total_dt += dt;
        }
        i += 1;
    }

    if total_dt == 0 {
        return history.get(len - 1).unwrap().price;
    }

    weighted_sum / (total_dt as i128)
}
