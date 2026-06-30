#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Map, Symbol,
};

const SCHEDULES: Symbol = symbol_short!("SCHED");
const CLAIMED: Symbol = symbol_short!("CLAIMD");

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingSchedule {
    pub beneficiary: Address,
    pub total_amount: i128,
    pub start: u64,
    pub cliff: u64,
    pub duration: u64,
}

#[contract]
pub struct VestingContract;

#[contractimpl]
impl VestingContract {
    pub fn create_schedule(
        env: Env,
        beneficiary: Address,
        total_amount: i128,
        start: u64,
        cliff: u64,
        duration: u64,
    ) {
        if total_amount <= 0 {
            panic!("Total amount must be positive");
        }
        if duration == 0 {
            panic!("Duration must be positive");
        }
        if cliff > duration {
            panic!("Cliff cannot exceed duration");
        }

        let mut schedules: Map<Address, VestingSchedule> =
            env.storage().instance().get(&SCHEDULES).unwrap_or(Map::new(&env));

        if schedules.contains_key(beneficiary.clone()) {
            panic!("Schedule already exists for beneficiary");
        }

        let schedule = VestingSchedule {
            beneficiary: beneficiary.clone(),
            total_amount,
            start,
            cliff,
            duration,
        };

        schedules.set(beneficiary, schedule);
        env.storage().instance().set(&SCHEDULES, &schedules);
    }

    pub fn claim_tokens(env: Env, beneficiary: Address) -> i128 {
        let schedules: Map<Address, VestingSchedule> =
            env.storage().instance().get(&SCHEDULES).unwrap_or(Map::new(&env));

        let schedule = schedules
            .get(beneficiary.clone())
            .expect("No schedule found for beneficiary");

        let current_time = env.ledger().timestamp();

        if current_time < schedule.start + schedule.cliff {
            panic!("Cliff period not yet passed");
        }

        let elapsed = if current_time >= schedule.start + schedule.duration {
            schedule.duration
        } else {
            current_time - schedule.start
        };

        let vested_amount = (schedule.total_amount * elapsed as i128) / schedule.duration as i128;

        let mut claimed_map: Map<Address, i128> =
            env.storage().instance().get(&CLAIMED).unwrap_or(Map::new(&env));

        let already_claimed = claimed_map.get(beneficiary.clone()).unwrap_or(0);
        let claimable = vested_amount - already_claimed;

        if claimable <= 0 {
            panic!("No tokens available to claim");
        }

        claimed_map.set(beneficiary, vested_amount);
        env.storage().instance().set(&CLAIMED, &claimed_map);

        claimable
    }

    pub fn get_vested_amount(env: Env, beneficiary: Address) -> i128 {
        let schedules: Map<Address, VestingSchedule> =
            env.storage().instance().get(&SCHEDULES).unwrap_or(Map::new(&env));

        let schedule = schedules
            .get(beneficiary.clone())
            .expect("No schedule found for beneficiary");

        let current_time = env.ledger().timestamp();

        if current_time < schedule.start + schedule.cliff {
            return 0;
        }

        let elapsed = if current_time >= schedule.start + schedule.duration {
            schedule.duration
        } else {
            current_time - schedule.start
        };

        (schedule.total_amount * elapsed as i128) / schedule.duration as i128
    }

    pub fn get_claimed_amount(env: Env, beneficiary: Address) -> i128 {
        let claimed_map: Map<Address, i128> =
            env.storage().instance().get(&CLAIMED).unwrap_or(Map::new(&env));
        claimed_map.get(beneficiary).unwrap_or(0)
    }

    pub fn get_schedule(env: Env, beneficiary: Address) -> Option<VestingSchedule> {
        let schedules: Map<Address, VestingSchedule> =
            env.storage().instance().get(&SCHEDULES).unwrap_or(Map::new(&env));
        schedules.get(beneficiary)
    }
}

#[cfg(test)]
mod test;
