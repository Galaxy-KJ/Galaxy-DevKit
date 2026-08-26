# Automation persistence

Migration `20260826000000_automation_persistence.sql` stores automation rules
and aggregate execution metrics in Supabase. The rule identifier is stable and
metrics cascade with rule deletion. Active rules can be rehydrated by selecting
`automation_rules.status = 'ACTIVE'` and passed through the existing
`CronManager` during service startup.

The process-local maps remain useful as a hot cache, but database writes must
complete before a successful mutation is reported to callers.
