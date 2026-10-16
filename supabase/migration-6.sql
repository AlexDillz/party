-- Реклама на просмотре: кто сейчас смотрит рекламу, тому не шлём перемотку, второй ждёт. Выполни целиком в SQL Editor.

alter table watch add column if not exists ad_by text;
alter table watch add column if not exists ad_at timestamptz;

drop function if exists set_ad(text, text, boolean);
create function set_ad(p_code text, p_who text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  if p_who not in ('Вика','Витя') then return; end if;
  update watch set ad_by = case when p_on then p_who else null end, ad_at = now() where id = 1;
end $$;

-- get_watch как раньше, плюс поле ad (метка живёт 20 секунд, клиент её обновляет)
drop function if exists get_watch(text);
create function get_watch(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare v_url text; v_playing boolean; v_pos double precision; v_by text; v_el double precision; v_ad text;
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  select url, playing, pos, "by", extract(epoch from now() - updated_at),
         case when ad_by is not null and now() - ad_at < interval '20 seconds' then ad_by end
    into v_url, v_playing, v_pos, v_by, v_el, v_ad from watch where id = 1;
  if v_playing and v_el > 20 then v_playing := false; v_el := 0; end if;
  return json_build_object('url', v_url, 'playing', v_playing, 'pos', v_pos, 'by', v_by, 'elapsed', v_el, 'ad', v_ad);
end $$;
