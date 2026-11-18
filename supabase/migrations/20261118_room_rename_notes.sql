-- v0.2.14: 방 이름 바꾸기, 꺼진 친구에게 쪽지 남기기 (기존 표·함수는 그대로, 새로 더하기만)

create or replace function public.rename_room(p_room uuid, p_name text)
returns text
language sql
security definer
set search_path to ''
as $$
  update public.rooms set name = left(coalesce(nullif(trim(p_name), ''), '우리 방'), 30)
  where id = p_room
  returning name;
$$;

create or replace function public.room_info(p_room uuid)
returns table(id uuid, code text, name text)
language sql
stable security definer
set search_path to ''
as $$
  select r.id, r.code, r.name from public.rooms r where r.id = p_room;
$$;

create table if not exists public.room_notes (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  to_device uuid not null,
  from_device uuid not null,
  from_name text not null,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists room_notes_to on public.room_notes (room_id, to_device);
alter table public.room_notes enable row level security; -- 직접 읽기·쓰기는 막고 아래 함수로만

create or replace function public.leave_note(p_room uuid, p_to uuid, p_from uuid, p_from_name text, p_body text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- 한 친구 앞으로 쌓이는 쪽지는 20개까지 (넘으면 오래된 것부터 지운다)
  insert into public.room_notes (room_id, to_device, from_device, from_name, body)
  values (p_room, p_to, p_from, left(trim(p_from_name), 30), left(trim(p_body), 200));
  delete from public.room_notes where id in (
    select id from public.room_notes where room_id = p_room and to_device = p_to
    order by created_at desc offset 20
  );
end $$;

-- 내 앞으로 온 쪽지를 받고 지운다 (한 번만 보여 준다)
create or replace function public.take_notes(p_room uuid, p_device uuid)
returns table(from_device uuid, from_name text, body text, created_at timestamptz)
language sql
security definer
set search_path to ''
as $$
  delete from public.room_notes n where n.room_id = p_room and n.to_device = p_device
  returning n.from_device, n.from_name, n.body, n.created_at;
$$;
