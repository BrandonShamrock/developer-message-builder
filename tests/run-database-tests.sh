#!/usr/bin/env bash
# Creates and destroys ONLY a disposable Docker PostgreSQL instance.
set -euo pipefail
cd "$(dirname "$0")/.."
container="amper-besig-tests-$$"
docker_local() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"
}
cleanup() { docker_local rm -f "$container" >/dev/null; }
trap cleanup EXIT
docker_local run -d --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null
ready=false
for attempt in {1..30}; do
  if docker_local exec "$container" pg_isready -U postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then docker_local logs "$container"; exit 1; fi
pgtest() { docker_local exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
pgtest < tests/database-bootstrap.sql
for file in supabase/postx_daily_schema.sql supabase/postx_daily_kanban_update.sql supabase/postx_daily_transfer_update.sql supabase/crm_schema.sql; do pgtest < "$file"; done
pgtest -c "insert into daily_tasks(owner_id,title,status,created_by,completed_at) values('22222222-2222-2222-2222-222222222222','Legacy completed','completed','22222222-2222-2222-2222-222222222222',now());"
for pass in 1 2; do
  for file in supabase/amper_besig_ticket_categories_qc.sql supabase/amper_besig_user_preferences.sql supabase/amper_besig_products.sql supabase/amper_besig_quotes.sql; do pgtest < "$file"; done
done
pgtest -c "do \$\$ begin assert (select category='Other' and status='completed' from daily_tasks where title='Legacy completed'); end \$\$;"
# Seed actual 17-item and VAT-exclusive history before testing the incremental upgrade.
pgtest < tests/database-legacy-fixture.sql
for pass in 1 2; do
  for file in supabase/amper_besig_qc_livechat.sql supabase/amper_besig_quote_vat.sql; do pgtest < "$file"; done
done
pgtest < tests/database.test.sql
for pass in 1 2; do pgtest < supabase/amper_besig_quote_proposal.sql; done
pgtest < tests/quote-proposal.test.sql
pgtest -c "create table public.test_pre_archive_quotes as select id,to_jsonb(q) as header,(select jsonb_agg(to_jsonb(i) order by position) from public.crm_quote_items i where quote_id=q.id) as items from public.crm_quotes q;"
for pass in 1 2; do pgtest < supabase/amper_besig_quote_archiving.sql; done
pgtest < tests/quote-archiving.test.sql
pgtest < supabase/amper_besig_quote_archiving.sql
pgtest -c "do \$\$ begin assert (select is_archived from public.crm_quotes where notes='Legacy issued'); end \$\$;"
