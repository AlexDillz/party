-- Выполни целиком в Supabase → SQL Editor.

create table users (
  name    text primary key check (name in ('Вика','Витя')),
  tg_id   bigint unique,
  chat_id bigint,
  code    text unique
);
create table items (
  id         bigserial primary key,
  section    text not null check (section in ('eat','walk','wish','want')),
  title      text not null,
  note       text not null default '',
  link       text not null default '',
  author     text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create table watch (
  id         int primary key check (id = 1),
  url        text,
  playing    boolean not null default false,
  pos        double precision not null default 0,
  by         text,
  updated_at timestamptz not null default now()
);
insert into watch(id) values (1);

-- Прямой доступ к таблицам закрыт полностью; всё идёт через функции с проверкой номерка.
alter table users enable row level security;
alter table items enable row level security;
alter table watch enable row level security;
revoke all on users, items, watch from anon, authenticated;
revoke all on sequence items_id_seq from anon, authenticated;

create function _ok(c text) returns boolean language sql security definer set search_path = public as
$$ select c is not null and length(c) >= 8 and exists (select 1 from users where code = c) $$;
revoke execute on function _ok(text) from public, anon, authenticated;

create function check_code(p_code text) returns boolean language sql security definer set search_path = public as
$$ select _ok(p_code) $$;

create function list_items(p_code text, p_section text) returns setof items
language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  return query select * from items where section = p_section order by done, created_at desc;
end $$;

create function add_item(p_code text, p_section text, p_title text, p_note text, p_link text, p_author text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  insert into items(section, title, note, link, author)
  values (p_section, left(p_title,200), left(p_note,1000), left(p_link,500), case when p_author in ('Вика','Витя') then p_author else '?' end);
end $$;

create function toggle_item(p_code text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  update items set done = not done where id = p_id;
end $$;

create function delete_item(p_code text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  delete from items where id = p_id;
end $$;

create function get_watch(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare w watch;
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  select * into w from watch where id = 1;
  return json_build_object('url', w.url, 'playing', w.playing, 'pos', w.pos, 'by', w.by,
                           'elapsed', extract(epoch from now() - w.updated_at));
end $$;

create function set_watch(p_code text, p_url text, p_playing boolean, p_pos double precision, p_by text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  if p_url !~* '^https?://' then raise exception 'bad url'; end if;
  update watch set url = left(p_url,500), playing = p_playing, pos = p_pos, by = p_by, updated_at = now() where id = 1;
end $$;

-- После создания бота: впиши tg id (число) себя и Вики. Узнать можно у @userinfobot.
-- insert into users(name, tg_id) values ('Вика', 111111111), ('Витя', 222222222);
