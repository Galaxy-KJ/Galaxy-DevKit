use crate::types::PriceEntry;
use soroban_sdk::Vec;

/// Compute the time-weighted average price over `[window_start, now]`.
///
/// TWAP = Σ(price_i × Δt_i) / Σ(Δt_i)
///
/// For each entry, Δt_i is the overlap between its active interval
/// (`[entry.timestamp, next_entry.timestamp_or_now]`) and the requested
/// window — this correctly "carries forward" a stale price across the
/// entire window when the observation predates `window_start` (handles
/// large gaps between updates), and naturally excludes any interval before
/// `window_start`.
///
/// Passing `window_start = 0` computes the TWAP over the *entire* stored
/// history, which is what [`compute_twap`] does.
///
/// # Panics
/// None directly, but assumes `history` is non-empty — callers must check
/// that first (see [`crate::OracleError::PriceNotFound`] /
/// [`crate::OracleError::InsufficientHistory`]).
pub fn compute_twap_window(history: &Vec<PriceEntry>, now: u64, window_start: u64) -> i128 {
    let mut weighted_sum: i128 = 0;
    let mut total_time: i128 = 0;

    for i in 0..history.len() {
        let entry = history.get(i).unwrap();
        let end_time: u64 = if i + 1 < history.len() {
            history.get(i + 1).unwrap().timestamp
        } else {
            now
        };

        let segment_start = entry.timestamp.max(window_start);
        let segment_end = end_time.min(now);
        let duration = segment_end.saturating_sub(segment_start) as i128;

        weighted_sum += entry.price * duration;
        total_time += duration;
    }

    if total_time == 0 {
        // Degenerate case: no observation carried positive weight inside the
        // window (all timestamps identical, or a single observation exactly
        // at `now`). Fall back to the arithmetic mean of whichever
        // observations actually fall within `[window_start, now]` — with
        // `window_start = 0` this is every entry, matching the old
        // full-history behaviour. If none fall inside (a window narrower
        // than the age of the only available observation), fall back to the
        // most recent observation so the call still degrades gracefully
        // instead of panicking.
        let mut sum: i128 = 0;
        let mut count: i128 = 0;
        for entry in history.iter() {
            if entry.timestamp >= window_start && entry.timestamp <= now {
                sum += entry.price;
                count += 1;
            }
        }
        if count > 0 {
            return sum / count;
        }
        return history.get(history.len() - 1).unwrap().price;
    }

    weighted_sum / total_time
}

/// Compute the TWAP over the entire stored history (no window bound).
pub fn compute_twap(history: &Vec<PriceEntry>, now: u64) -> i128 {
    compute_twap_window(history, now, 0)
}
