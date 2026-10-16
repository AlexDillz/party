-- Видео/голосовой звонок на «Совместном просмотре»: короткие сигналы для WebRTC. Выполни целиком в SQL Editor.
-- Сами видео и звук идут напрямую между устройствами, тут только «рукопожатие».

create table if not exists rtc (
  id         bigserial primary key,
  from_name  text not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
alter table rtc enable row level security;
revoke all on rtc from anon, authenticated;
revoke all on sequence rtc_id_seq from anon, authenticated;

drop function if exists rtc_send(text, text, jsonb);
drop function if exists rtc_poll(text, text, bigint);

create function rtc_send(p_code text, p_from text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  if length(p_data::text) > 20000 then raise exception 'too big'; end if;
  delete from rtc where created_at < now() - interval '10 minutes';
  insert into rtc(from_name, data)
  values (case when p_from in ('Вика','Витя') then p_from else '?' end, p_data);
end $$;

create function rtc_poll(p_code text, p_me text, p_after bigint) returns setof rtc
language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  return query select * from rtc
    where id > p_after and from_name <> p_me and created_at > now() - interval '2 minutes'
    order by id limit 100;
end $$;
