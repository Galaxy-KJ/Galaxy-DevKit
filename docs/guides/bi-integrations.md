# Business intelligence integration contract

This guide defines the export boundary for the analytics datasets requested by
issue #414. Exporters should implement this interface without coupling extraction
to a particular warehouse or BI vendor.

## Dataset contract

Each export is partitioned by `event_date` and carries an opaque `tenant_id`.
The default column set excludes wallet labels, email addresses, IP addresses,
and other direct identifiers. Sensitive columns require an explicit export
option and an audit event containing the requester and selected columns.

Recommended fact datasets are `transactions`, `automation_executions`,
`price_observations`, and `api_requests`. Recommended dimensions are `date`,
`asset`, `protocol`, `network`, and pseudonymized `wallet`.

## Incremental delivery

An exporter persists an `updated_at` watermark per tenant and dataset. A run
selects rows strictly after the stored watermark, writes a date-partitioned
Parquet object, and advances the watermark only after the object upload
succeeds. CSV is a fallback format for consumers without Parquet support.

## Delivery adapters

The extraction layer should emit a format-neutral `AnalyticsBatch`. Object
storage, BigQuery, Postgres, and future Snowflake/Redshift adapters consume that
batch. Webhook and Kafka/PubSub delivery should reuse the existing monitoring
channel dispatcher rather than creating a second notification path.

All download URLs must be signed and expiring, and every export request must be
tenant-scoped and audit logged.
