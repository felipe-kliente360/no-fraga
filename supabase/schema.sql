create extension if not exists "pgcrypto";

create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(10,2) not null check (amount > 0),
  category text,
  person text not null check (person in ('Felipe', 'Teresa', 'Casal')),
  description text,
  payment_method text check (payment_method in ('Pix', 'Crédito', 'Débito', 'Dinheiro')),
  installment_current integer,
  installment_total integer,
  installment_group_id uuid,
  tags text[],
  created_at timestamptz default now()
);

alter table transactions enable row level security;

create policy "authenticated_all" on transactions
  for all using (auth.role() = 'authenticated');

create index if not exists idx_tx_date on transactions(date desc);
create index if not exists idx_tx_type on transactions(type);
create index if not exists idx_tx_person on transactions(person);
create index if not exists idx_tx_category on transactions(category);
create index if not exists idx_tx_group on transactions(installment_group_id);
