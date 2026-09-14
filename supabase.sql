-- ============================================================
-- HOME SPA FAMILY — Skema tabel bookings (Supabase Postgres)
-- Cara pakai: buka SQL Editor di dashboard Supabase project
-- kyxqufvwvofdaohqlknf, paste seluruh file ini, lalu RUN.
-- ============================================================

create table if not exists public.bookings (
  id text primary key,
  service text not null,
  price integer not null default 0,
  tanggal date not null,
  jam text not null,
  nama text not null,
  whatsapp text not null,
  alamat text not null,
  catatan text not null default '',
  status text not null default 'Menunggu Konfirmasi',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Index agar query admin (urut terbaru, filter tanggal/status) cepat
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists bookings_tanggal_idx on public.bookings (tanggal);
create index if not exists bookings_status_idx on public.bookings (status);

-- ============================================================
-- Row Level Security: matikan RLS agar service_role & anon key
-- bisa dipakai langsung dari backend tanpa policy rumit.
-- (Akses tulis tetap dilindungi ADMIN_KEY di layer API.)
-- ============================================================
alter table public.bookings disable row level security;

-- ============================================================
-- Tabel riwayat chat WhatsApp untuk Eva AI
-- (auto-reply via Fonnte webhook: api/wa-webhook.js)
-- ============================================================
create table if not exists public.wa_messages (
  id bigint generated always as identity primary key,
  chat_id text not null,
  sender_type text not null check (sender_type in ('customer', 'eva')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_wa_messages_chat_created
  on public.wa_messages (chat_id, created_at desc);

alter table public.wa_messages disable row level security;
