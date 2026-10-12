-- Вкладка «Совместное времяпровождение» + фото/видео у пунктов. Выполни целиком в SQL Editor.

-- 1. новая секция и колонка с вложениями
alter table items drop constraint if exists items_section_check;
alter table items add constraint items_section_check check (section in ('eat','walk','wish','want','together'));
alter table items add column if not exists media jsonb not null default '[]';

-- 2. публичный бакет для файлов (до 50 МБ на файл — лимит бесплатного плана)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
              'video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- загружать можно, читать — по публичной ссылке (имена файлов — случайные uuid), менять/удалять нельзя
drop policy if exists "media upload" on storage.objects;
create policy "media upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'media');

-- 3. add_item с вложениями
drop function if exists add_item(text, text, text, text, text, text);
create function add_item(p_code text, p_section text, p_title text, p_note text, p_link text, p_author text, p_media jsonb default '[]')
returns void language plpgsql security definer set search_path = public as $$
declare m jsonb; clean jsonb := '[]';
begin
  if not _ok(p_code) then raise exception 'denied'; end if;
  if jsonb_typeof(p_media) = 'array' then
    for m in select * from jsonb_array_elements(p_media) limit 10 loop
      if (m->>'p') ~ '^[0-9a-f-]{36}\.[a-z0-9]{2,5}$' and (m->>'t') in ('image','video') then
        clean := clean || jsonb_build_array(jsonb_build_object('p', m->>'p', 't', m->>'t'));
      end if;
    end loop;
  end if;
  insert into items(section, title, note, link, author, media)
  values (p_section, left(p_title,200), left(p_note,1000), left(p_link,500),
          case when p_author in ('Вика','Витя') then p_author else '?' end, clean);
end $$;
