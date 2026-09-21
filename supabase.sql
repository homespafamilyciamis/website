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

-- ============================================================
-- HOME SPA FAMILY — OTOMASI EVA (broadcast, follow-up, laporan AI)
-- Blok di bawah ini dipakai oleh:
--   customerStore.js, automationStore.js, waFollowup.js, waBlast.js,
--   api/cron/daily.js, api/cron/weekly.js, api/customers.js,
--   api/broadcast.js, api/automation.js, api/analytics.js
--
-- Aman dijalankan berulang (idempotent).
--
-- CATATAN KEAMANAN: mengikuti pola tabel lain di file ini, RLS dimatikan
-- agar backend (anon/service_role) bisa akses. Sebaiknya pasang
-- SUPABASE_SERVICE_ROLE_KEY di Vercel, dan JANGAN pakai anon key ini di
-- frontend untuk tabel customers (berisi data pribadi pelanggan).
-- ============================================================

-- ---------- Normalisasi nomor WA ke format 62xxxxxxxxxx ----------
create or replace function public.hsf_normalize_wa(p text)
returns text
language sql
immutable
as $fn$
  select case
    when p is null then null
    when regexp_replace(p, '\D', '', 'g') = '' then null
    when regexp_replace(p, '\D', '', 'g') like '0%'
      then '62' || substring(regexp_replace(p, '\D', '', 'g') from 2)
    when regexp_replace(p, '\D', '', 'g') like '62%'
      then regexp_replace(p, '\D', '', 'g')
    when regexp_replace(p, '\D', '', 'g') like '8%'
      then '62' || regexp_replace(p, '\D', '', 'g')
    else regexp_replace(p, '\D', '', 'g')
  end;
$fn$;

-- ---------- 1) Master pelanggan ----------
create table if not exists public.customers (
  id bigint generated always as identity primary key,
  wa_number text not null unique,
  nama text,
  alamat text,
  segmen text not null default 'baru'
    check (segmen in ('baru', 'aktif', 'pasif', 'hangat')),
  opt_in boolean not null default true,
  opt_out_at timestamptz,
  first_seen timestamptz not null default now(),
  last_seen timestamptz,
  last_contact_at timestamptz,
  last_booking_at timestamptz,
  total_bookings integer not null default 0,
  total_spend numeric not null default 0,
  last_service text,
  followup_count integer not null default 0,
  followup_month text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_segmen_idx on public.customers (segmen);
create index if not exists customers_last_booking_idx on public.customers (last_booking_at desc);
create index if not exists customers_last_contact_idx on public.customers (last_contact_at desc);
create index if not exists customers_last_seen_idx on public.customers (last_seen desc);

alter table public.customers disable row level security;

-- ---------- 2) Antrean pesan keluar (satu pintu untuk semua otomasi) ----------
create table if not exists public.wa_outbox (
  id bigint generated always as identity primary key,
  customer_id bigint references public.customers(id) on delete set null,
  wa_number text not null,
  nama text,
  kind text not null
    check (kind in ('broadcast', 'followup', 'reminder', 'review', 'admin')),
  template_key text,
  campaign_id bigint,
  message text not null,
  vars jsonb not null default '{}'::jsonb,
  send_at timestamptz not null default now(),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  provider_id text,
  error text,
  dedupe_key text unique,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists wa_outbox_status_send_at_idx
  on public.wa_outbox (status, send_at);
create index if not exists wa_outbox_wa_created_idx
  on public.wa_outbox (wa_number, created_at desc);

alter table public.wa_outbox disable row level security;

-- ---------- 3) Campaign broadcast ----------
create table if not exists public.broadcasts (
  id bigint generated always as identity primary key,
  nama text not null,
  pesan text not null,
  target_filter jsonb not null default '{}'::jsonb,
  schedule_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'menunggu_approval', 'disetujui', 'terkirim', 'dibatalkan')),
  total_target integer not null default 0,
  total_sent integer not null default 0,
  sumber text not null default 'admin' check (sumber in ('admin', 'ai')),
  catatan text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists broadcasts_status_idx on public.broadcasts (status, schedule_at);

alter table public.broadcasts disable row level security;

-- ---------- 4) Laporan analisis AI ----------
create table if not exists public.analytics_reports (
  id bigint generated always as identity primary key,
  periode text not null default 'mingguan',
  period_start date,
  period_end date,
  metrics jsonb not null default '{}'::jsonb,
  ringkasan text,
  temuan jsonb not null default '[]'::jsonb,
  opsi jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_reports_created_idx
  on public.analytics_reports (created_at desc);

alter table public.analytics_reports disable row level security;

-- ---------- 5) Saklar aturan otomasi (bisa dimatikan dari /admin) ----------
create table if not exists public.automation_rules (
  key text primary key,
  title text not null,
  description text,
  is_on boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.automation_rules disable row level security;

-- Bawaan: follow-up & pengingat AKTIF, broadcast/promosi NONAKTIF
-- (nanti diaktifkan sendiri dari tab Pengaturan di /admin).
insert into public.automation_rules (key, title, description, is_on, config) values
  ('broadcast_harian', 'Broadcast Harian 10.00',
   'Kirim 1 pesan broadcast sehari (segmen bergilir) pukul 10.00 WIB.',
   false,
   '{"max_per_hari":40,"jeda_detik":"8-20","jam":10,"segmen_per_hari":{"1":"pasif","2":"hangat","3":"aktif","4":"pasif","5":"hangat","6":"aktif","7":"baru"}}'::jsonb),
  ('followup_review', 'Follow-up 3 Hari (Pasca Layanan)',
   'Tanya pengalaman + minta review 3 hari setelah layanan selesai.',
   true,
   '{"delay_hari":3,"max_per_bulan":3}'::jsonb),
  ('followup_hangat', 'Follow-up 3 Hari (Chat Menggantung)',
   'Tindak lanjut pelanggan yang chat tapi belum booking, setiap 3 hari (maks 2 kali).',
   true,
   '{"delay_hari":3,"max_ke":2}'::jsonb),
  ('reactivation', 'Reaktivasi Pelanggan Lama',
   'Tawarkan treatment ke pelanggan yang sudah lama tidak kembali.',
   false,
   '{"min_hari":21,"max_per_bulan":2}'::jsonb),
  ('reminder_h1', 'Pengingat Jadwal H-1',
   'Konfirmasi jadwal sehari sebelum booking.',
   true,
   '{"jam_mulai":8,"jam_selesai":20}'::jsonb)
on conflict (key) do nothing;


-- ---------- 6) Sinkronisasi otomatis booking/chat -> pelanggan ----------

-- Hitung ulang statistik 1 pelanggan dari tabel bookings
create or replace function public.hsf_recalc_customer(p_wa text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_wa text := public.hsf_normalize_wa(p_wa);
  v_stat record;
  v_last record;
begin
  if v_wa is null or v_wa = '' then
    return;
  end if;

  select
    count(*) as total,
    coalesce(sum(price) filter (where status = 'Selesai'), 0) as belanja,
    max(
      case
        when status <> 'Dibatalkan'
          then ((tanggal::text || ' ' || coalesce(jam, '00:00'))::timestamp at time zone 'Asia/Jakarta')
      end
    ) as booking_terakhir
  into v_stat
  from public.bookings
  where public.hsf_normalize_wa(whatsapp) = v_wa;

  insert into public.customers (
    wa_number, first_seen, last_seen, last_booking_at,
    total_bookings, total_spend, updated_at
  )
  values (v_wa, now(), now(), v_stat.booking_terakhir, v_stat.total, v_stat.belanja, now())
  on conflict (wa_number) do update set
    total_bookings = v_stat.total,
    total_spend = v_stat.belanja,
    last_booking_at = v_stat.booking_terakhir,
    updated_at = now();

  select nama, alamat, service
  into v_last
  from public.bookings
  where public.hsf_normalize_wa(whatsapp) = v_wa
  order by created_at desc
  limit 1;

  update public.customers set
    nama = coalesce(v_last.nama, nama),
    alamat = coalesce(v_last.alamat, alamat),
    last_service = coalesce(v_last.service, last_service),
    updated_at = now()
  where wa_number = v_wa;
end;
$fn$;

-- Trigger: booking baru / status berubah -> perbarui pelanggan
create or replace function public.hsf_trg_booking_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.hsf_recalc_customer(new.whatsapp);
  if tg_op = 'UPDATE' and (old.whatsapp is distinct from new.whatsapp) then
    perform public.hsf_recalc_customer(old.whatsapp);
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_bookings_sync_customer on public.bookings;
create trigger trg_bookings_sync_customer
after insert or update on public.bookings
for each row execute function public.hsf_trg_booking_sync();

-- Trigger: chat masuk/keluar -> catat pelanggan (last_seen)
create or replace function public.hsf_trg_chat_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_wa text := public.hsf_normalize_wa(new.chat_id);
  v_is_customer boolean := (new.sender_type = 'customer');
begin
  if v_wa is null or v_wa = '' then
    return new;
  end if;

  -- Catat pelanggan walau pesan keluar (proaktif), tapi "last_seen"
  -- hanya diperbarui saat pelanggan yang menulis (bukan pesan kita).
  insert into public.customers (wa_number, first_seen, last_seen)
  values (v_wa, new.created_at, case when v_is_customer then new.created_at else null end)
  on conflict (wa_number) do update set
    last_seen = case
      when v_is_customer
        then greatest(public.customers.last_seen, new.created_at)
      else public.customers.last_seen
    end,
    updated_at = now();

  return new;
end;
$fn$;

drop trigger if exists trg_wa_messages_sync_customer on public.wa_messages;
create trigger trg_wa_messages_sync_customer
after insert on public.wa_messages
for each row execute function public.hsf_trg_chat_sync();

-- ============================================================
-- 7) VIEW AGREGAT untuk /admin & laporan AI
-- Semua angka dihitung di database (bukan oleh model AI),
-- supaya laporan selalu berbasis data nyata, bukan tebakan.
-- ============================================================

-- Omset & volume booking per tanggal layanan
create or replace view public.v_omset_harian as
select
  b.tanggal as hari,
  count(*) as total_booking,
  count(*) filter (where b.status = 'Selesai') as selesai,
  count(*) filter (where b.status = 'Terkonfirmasi') as terkonfirmasi,
  count(*) filter (where b.status = 'Menunggu Konfirmasi') as menunggu,
  count(*) filter (where b.status = 'Dibatalkan') as dibatalkan,
  coalesce(sum(b.price) filter (where b.status = 'Selesai'), 0) as omset,
  coalesce(sum(b.price) filter (where b.status <> 'Dibatalkan'), 0) as potensi
from public.bookings b
group by b.tanggal;

-- Tren per layanan per pekan
create or replace view public.v_layanan_tren as
select
  b.service as layanan,
  date_trunc('week', b.tanggal)::date as minggu,
  count(*) as total_booking,
  coalesce(sum(b.price) filter (where b.status = 'Selesai'), 0) as omset
from public.bookings b
group by 1, 2;

-- Jam tersibuk / tersepi
create or replace view public.v_jam_sibuk as
select
  substring(b.jam from 1 for 2) as jam,
  count(*) as total_booking
from public.bookings b
where b.status <> 'Dibatalkan'
group by 1;

-- Ringkasan pelanggan per segmen
create or replace view public.v_pelanggan_ringkas as
select
  count(*) as total_pelanggan,
  count(*) filter (where opt_in) as bisa_dihubungi,
  count(*) filter (where not opt_in) as opt_out,
  count(*) filter (where segmen = 'baru') as baru,
  count(*) filter (where segmen = 'hangat') as hangat,
  count(*) filter (where segmen = 'aktif') as aktif,
  count(*) filter (where segmen = 'pasif') as pasif,
  coalesce(sum(total_spend), 0) as total_belanja
from public.customers;

-- ============================================================
-- 8) Penyegaran segmen pelanggan (dipanggil cron harian)
--    aktif  : pernah booking, terakhir <= 30 hari
--    pasif  : pernah booking, terakhir > 30 hari
--    hangat : belum pernah booking, chat <= 7 hari
--    baru   : sisanya
-- ============================================================
create or replace function public.hsf_refresh_segments()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with hitung as (
    select
      c.id,
      case
        when c.total_bookings >= 1
          and c.last_booking_at >= now() - interval '30 days' then 'aktif'
        when c.total_bookings >= 1 then 'pasif'
        when c.last_seen >= now() - interval '7 days' then 'hangat'
        else 'baru'
      end as segmen_baru
    from public.customers c
  )
  update public.customers c
  set segmen = h.segmen_baru,
      updated_at = now()
  from hitung h
  where h.id = c.id
    and c.segmen is distinct from h.segmen_baru;

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- ============================================================
-- 9) Hak akses (mengikuti pola tabel lain di file ini:
--    backend memakai anon/service_role tanpa policy RLS)
-- ============================================================
grant select, insert, update, delete on public.customers to anon, authenticated, service_role;
grant select, insert, update, delete on public.wa_outbox to anon, authenticated, service_role;
grant select, insert, update, delete on public.broadcasts to anon, authenticated, service_role;
grant select, insert, update, delete on public.analytics_reports to anon, authenticated, service_role;
grant select, insert, update, delete on public.automation_rules to anon, authenticated, service_role;

grant select on public.v_omset_harian to anon, authenticated, service_role;
grant select on public.v_layanan_tren to anon, authenticated, service_role;
grant select on public.v_jam_sibuk to anon, authenticated, service_role;
grant select on public.v_pelanggan_ringkas to anon, authenticated, service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;
