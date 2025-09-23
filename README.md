تشغيل:
1) npm install
2) إعداد متغيرات البيئة على Vercel أو ملف .env.local:
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   NEXT_PUBLIC_ADMIN_PASSWORD=admin123
3) npm run dev

جدول Supabase:
create table events(
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  description text,
  created_at timestamp with time zone default now()
);
alter table events enable row level security;
create policy "select_all" on events for select using (true);
create policy "insert_all" on events for insert with check (true);

نشر على Vercel: اربط المتغيرات ثم Deploy.
