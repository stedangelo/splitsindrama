-- ─── Sistema de ingresos recurrentes — Split Sin Drama ──────────────────
-- Esquema para suscripciones recurrentes (plan Pro mensual/anual) y para el
-- conteo mensual de escaneos del plan Free.
--
-- Ejecútalo en el SQL Editor de Supabase (o con `supabase db push`).
-- Es idempotente: puedes correrlo varias veces sin romper nada.

-- 1) Tabla de suscripciones (una fila por usuario) ------------------------
create table if not exists public.subscriptions (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  plan                text        not null default 'free',   -- 'free' | 'pro'
  status              text        not null default 'active',  -- 'active' | 'paused' | 'canceled'
  billing             text,                                    -- 'monthly' | 'annual'
  current_period_end  timestamptz,                             -- fecha de renovación
  mp_preapproval_id   text,                                    -- id de la suscripción en Mercado Pago
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Migración desde el modelo anterior de créditos (si la columna existía).
alter table public.subscriptions add column if not exists plan               text        not null default 'free';
alter table public.subscriptions add column if not exists status             text        not null default 'active';
alter table public.subscriptions add column if not exists billing            text;
alter table public.subscriptions add column if not exists current_period_end timestamptz;
alter table public.subscriptions add column if not exists mp_preapproval_id  text;
alter table public.subscriptions add column if not exists updated_at         timestamptz not null default now();

-- 2) Aseguramos created_at en `scans` para el conteo mensual ---------------
alter table public.scans add column if not exists created_at timestamptz not null default now();
create index if not exists scans_user_created_idx on public.scans (user_id, created_at);

-- 3) Row Level Security ----------------------------------------------------
alter table public.subscriptions enable row level security;

-- El usuario puede leer solo su propia suscripción.
drop policy if exists "own subscription readable" on public.subscriptions;
create policy "own subscription readable"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Las escrituras las hace el webhook con la service role key (que ignora RLS).
-- No se otorga insert/update a usuarios anónimos ni autenticados a propósito,
-- para que nadie pueda auto-activarse el plan Pro desde el cliente.
