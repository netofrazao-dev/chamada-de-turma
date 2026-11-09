-- =========================================================
-- Keep-alive do Supabase (OPCIONAL, mas recomendado)
--
-- Rode UMA vez em: Supabase → SQL Editor → New query → cole tudo → Run.
--
-- Cria uma função keep_alive() que grava a data/hora do último "ping".
-- O workflow .github/workflows/keep-alive.yml chama essa função todo dia,
-- garantindo que o banco tenha atividade de escrita e nunca seja pausado.
-- Sem este arquivo o keep-alive continua funcionando (faz só leituras).
--
-- Seguro: a tabela fica fechada (RLS sem políticas) e a função só
-- atualiza uma única linha com a data atual.
-- =========================================================

create table if not exists public.keep_alive (
  id smallint primary key default 1 check (id = 1),
  ultimo_ping timestamptz not null default now(),
  total_pings bigint not null default 0
);

alter table public.keep_alive enable row level security;

create or replace function public.keep_alive()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  insert into public.keep_alive (id, ultimo_ping, total_pings)
  values (1, now(), 1)
  on conflict (id) do update
    set ultimo_ping = excluded.ultimo_ping,
        total_pings = public.keep_alive.total_pings + 1
  returning ultimo_ping;
$$;

revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;

-- Para conferir quando foi o último ping:
-- select * from public.keep_alive;
