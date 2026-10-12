drop function if exists check_code(text);
create function check_code(p_code text) returns text language sql security definer set search_path = public as
$$ select name from users where p_code is not null and length(p_code) >= 8 and code = p_code $$;
