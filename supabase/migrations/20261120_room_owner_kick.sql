-- 방장: 강퇴(내보내기), 방장 넘기기. 기존 앱(v0.2.14 이하)이 부르는 함수는 이름·인자·반환을 그대로 둔다.
--
-- 방장 규칙
--   - 방에 맨 처음 들어온 사람(= 방을 만든 사람). 이 기능 전에 만든 방은 들어온 순서 기록이 없어서, 적용 후 처음 접속한 사람.
--   - 방장이 나가거나 30일 넘게 안 들어오면, 남은 사람 중 가장 먼저 들어온 사람에게 넘어간다.
--   - 방장은 다른 멤버에게 직접 넘길 수 있다.
--
-- ponytail: 로그인이 없어서 "방장인지"는 기기 id로만 본다. 기기 id는 같은 방 사람에게 보이므로
-- 마음먹고 요청을 꾸미면 방장인 척할 수 있다. 친구끼리 쓰는 동안은 이대로, 막으려면 익명 로그인 + auth.uid() 검사로.

alter table public.rooms add column if not exists owner_id uuid;
alter table public.room_members add column if not exists joined_at timestamptz not null default now();

create table if not exists public.room_bans (
  room_id uuid not null references public.rooms(id) on delete cascade,
  device_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (room_id, device_id)
);
alter table public.room_bans enable row level security; -- 직접 읽기·쓰기는 막고 아래 함수로만

-- 방장이 없거나(나감·30일 넘게 안 옴) 비어 있으면 다시 정한다: 최근 30일 안에 온 사람 중 가장 먼저 들어온 사람
create or replace function public.fix_owner(p_room uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.rooms r set owner_id = (
    select m.device_id from public.room_members m where m.room_id = p_room
    order by (m.last_seen > now() - interval '30 days') desc, m.joined_at, m.last_seen desc
    limit 1
  )
  where r.id = p_room and not exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.device_id = r.owner_id and m.last_seen > now() - interval '30 days'
  );
$$;
revoke execute on function public.fix_owner(uuid) from public, anon, authenticated; -- 다른 함수 안에서만 쓴다

-- 접속 기록: 내보내진 기기는 다시 멤버가 되지 않는다
create or replace function public.touch_member(p_room uuid, p_device uuid, p_name text, p_character text, p_color text, p_image text)
returns void
language sql
security definer
set search_path to ''
as $$
  insert into public.room_members (room_id, device_id, name, character_id, color, image, last_seen)
  select p_room, p_device, trim(p_name), p_character, p_color, p_image, now()
  where not exists (select 1 from public.room_bans b where b.room_id = p_room and b.device_id = p_device)
  on conflict (room_id, device_id) do update
    set name = excluded.name, character_id = excluded.character_id, color = excluded.color, image = excluded.image, last_seen = now();
  select public.fix_owner(p_room);
$$;

-- 나가기: 방장이 나가면 다음 사람에게 넘어간다
create or replace function public.leave_room(p_room uuid, p_device uuid)
returns void
language sql
security definer
set search_path to ''
as $$
  delete from public.room_members where room_id = p_room and device_id = p_device;
  select public.fix_owner(p_room);
$$;

-- 내보내진 기기가 보낸 채팅은 저장하지 않는다
create or replace function public.send_message(p_room uuid, p_sender uuid, p_sender_name text, p_body text)
returns public.messages
language sql
security definer
set search_path to ''
as $$
  insert into public.messages (room_id, sender_id, sender_name, body)
  select p_room, p_sender, trim(p_sender_name), trim(p_body)
  where not exists (select 1 from public.room_bans b where b.room_id = p_room and b.device_id = p_sender)
  returning *;
$$;

-- 앱이 1분마다 묻는다: 방 이름, 방장, 내가 내보내졌는지
create or replace function public.room_state(p_room uuid, p_device uuid)
returns table(name text, owner_id uuid, kicked boolean)
language sql
stable security definer
set search_path to ''
as $$
  select r.name, r.owner_id,
    exists (select 1 from public.room_bans b where b.room_id = p_room and b.device_id = p_device)
  from public.rooms r where r.id = p_room;
$$;

-- 강퇴: 방장만, 자기 자신은 안 됨. 내보낸 기기는 이 방에 다시 못 들어온다.
create or replace function public.kick_member(p_room uuid, p_by uuid, p_target uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_by = p_target or not exists (select 1 from public.rooms r where r.id = p_room and r.owner_id = p_by) then
    return false;
  end if;
  insert into public.room_bans (room_id, device_id) values (p_room, p_target) on conflict do nothing;
  delete from public.room_members where room_id = p_room and device_id = p_target;
  delete from public.room_notes where room_id = p_room and to_device = p_target;
  return true;
end $$;

-- 방장 넘기기: 방장만, 지금 방 멤버에게만
create or replace function public.transfer_owner(p_room uuid, p_by uuid, p_to uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.rooms r set owner_id = p_to
  where r.id = p_room and r.owner_id = p_by
    and exists (select 1 from public.room_members m where m.room_id = p_room and m.device_id = p_to);
  return found;
end $$;
