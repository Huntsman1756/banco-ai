# Backup and Restore Runbook

## Backup

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

Store backups encrypted.

## Restore

```bash
psql "$DATABASE_URL" < backup-YYYYMMDD.sql
```

Verify row counts and check `audit_log` after restore.
