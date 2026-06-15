# Halcyon — Data Model

Two layers: the **local-first IndexedDB** model shipped in the wedge, and the **deferred Supabase/Postgres** model (specced now so auth + sync land without a rewrite). All IDs are UUIDv4 from day one so local rows map 1:1 to server rows. See [ARCHITECTURE §5](ARCHITECTURE.md).

## Layer 1 — IndexedDB (shipped in P1/P2)
DB `halcyon`, version 1 (thin Dexie wrapper).

| Store | Key | Fields |
|---|---|---|
| `blobs` | id (uuid) | bytes (original image, Blob) |
| `photos` | id (uuid) | name, width, height, mime, createdAt, blobId |
| `edits` | photoId (uuid) | params (ControlParams JSON), schemaVersion, updatedAt |
| `looks` | id (uuid) | name, target (LabStats JSON), refThumbIds, createdAt  *(store seam; save-a-look deferred)* |
| `meta` | key | value  *(appSchemaVersion, onboardingSeen, etc.)* |

`ControlParams` and `LabStats` shapes: see ARCHITECTURE §2-3. `schemaVersion` on every `edits` row → `migrate()` on read. Quota-exceeded and private-mode (no IndexedDB) handling: ARCHITECTURE §9.

## Layer 2 — Supabase / Postgres (DEFERRED, specced)
Lands when accounts/sync are needed (post-validation). **Security non-negotiables:** client uses the anon/publishable key ONLY; service-role key never in client or bundle; **RLS ON for every table**; all schema via versioned SQL migrations in `/supabase/migrations/`.

Tables (all carry `user_id uuid references auth.users` + `created_at`, `updated_at`):
- `photos` (id, user_id, name, width, height, mime, storage_path)
- `edits` (id, user_id, photo_id, params jsonb, schema_version)
- `looks` (id, user_id, name, target jsonb, ref_thumb_paths text[])
- `collections` (id, user_id, name) + `collection_photos` (collection_id, photo_id, user_id)  *(library is deferred; table shape reserved)*

**RLS policy (owner-only) — applies to every table above:**
```sql
alter table <t> enable row level security;
create policy "<t>_select_own" on <t> for select using (auth.uid() = user_id);
create policy "<t>_insert_own" on <t> for insert with check (auth.uid() = user_id);
create policy "<t>_update_own" on <t> for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "<t>_delete_own" on <t> for delete using (auth.uid() = user_id);
```
For `collection_photos`, scope by the joined `user_id` column (denormalized) so the policy stays a simple `auth.uid() = user_id` check.

**Storage:** per-user bucket prefix `photos/{user_id}/...` with a Storage RLS policy mirroring the table policy (read/write only your own prefix).

**Sync seam:** local `edits`/`looks` JSON push/pull by UUID under `user_id`. No engine change — the engine only ever reads/writes ControlParams.
