-- Ведущий просмотра, запоминание места, чат. Выполни целиком в SQL Editor.

create table if not exists progress (
  url        text primary key,
  pos        double precision not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists messages (
  id         bigserial primary key,
  author     text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
alter table progress enable row level security;
alter table messages enable row level security;
revoke all on progress, messages from anon, authenticated;
revoke all on sequence messages_id_seq from anon, authenticated;

drop function if exists set_watch(text, text, boolean, double precision, text);
drop function if exists get_watch(text);

-- Управляет только «ведущий» ("by"). Забрать пульт: p_take = true.
create function set_watch(p_code text, p_url text, p_playing boolean, p_pos double precision, p_by text, p_take boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare cur_by text; pos2 double precision := p_pos;
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  if p_url !~* '^https?://' then raise exception 'bad url'; end if;
  select "by" into cur_by from watch where id = 1;
  if not (p_take or cur_by is null or cur_by = p_by) then return; end if;
  if p_take and p_pos = 0 and not p_playing then   -- приглашение: продолжаем с места, где остановились
    select greatest(pr.pos - 3, 0) into pos2 from progress pr where pr.url = left(p_url,500);
    pos2 := coalesce(pos2, 0);
  end if;
  update watch set url = left(p_url,500), playing = p_playing, pos = pos2,
         "by" = case when p_take or cur_by is null then p_by else cur_by end, updated_at = now()
  where id = 1;
  insert into progress(url, pos) values (left(p_url,500), pos2)
  on conflict (url) do update set pos = excluded.pos, updated_at = now();
end $$;

-- Если ведущий пропал (закрыл вкладку), через 20 с считаем, что видео стоит.
create function get_watch(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare v_url text; v_playing boolean; v_pos double precision; v_by text; v_el double precision;
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  select url, playing, pos, "by", extract(epoch from now() - updated_at)
    into v_url, v_playing, v_pos, v_by, v_el from watch where id = 1;
  if v_playing and v_el > 20 then v_playing := false; v_el := 0; end if;
  return json_build_object('url', v_url, 'playing', v_playing, 'pos', v_pos, 'by', v_by, 'elapsed', v_el);
end $$;

create function list_msgs(p_code text, p_after bigint) returns setof messages
language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  return query select * from (select * from messages where id > p_after order by id desc limit 100) m order by id;
end $$;

create function send_msg(p_code text, p_author text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  if length(trim(p_body)) = 0 then return; end if;
  insert into messages(author, body)
  values (case when p_author in ('Вика','Витя') then p_author else '?' end, left(p_body, 1000));
end $$;
