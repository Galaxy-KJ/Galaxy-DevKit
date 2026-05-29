use soroban_sdk::{Env, Vec};
use crate::types::PriceEntry;

/// Compute the time-weighted average price for a rolling price history.
///
/// TWAP = Σ(price_i × Δt_i) / Σ(Δt_i)
/// where Δt_i is the time between the current entry and the next one, or
/// the current ledger timestamp for the last entry.
pub fn compute_twap(history: &Vec<PriceEntry>, now: u64) -> i128 {
    let mut weighted_sum: i128 = 0;
    let mut total_time: i128 = 0;

    for i in 0..history.len() {
        let entry = history.get(i).unwrap();
        let end_time: u64 = if i + 1 < history.len() {
            history.get(i + 1).unwrap().timestamp
        } else {
            now
        };
        let duration = end_time.saturating_sub(entry.timestamp) as i128;
        weighted_sum += entry.price * duration;
        total_time += duration;
    }

    if total_time == 0 {
        let mut sum: i128 = 0;
        for entry in history.iter() {
            sum += entry.price;
        }
        return sum / history.len() as i128;
    }

    weighted_sum / total_time
}
