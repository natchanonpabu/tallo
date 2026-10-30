-- Before accepting an invite code, show who it comes from so the person can pick the matching
-- contact in their own list instead of creating a duplicate.

create function public.peek_contact_invite(p_code text)
returns table (inviter_name text, inviter_color text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return query
    select p.display_name, p.color
    from public.contacts c
    join public.profiles p on p.id = c.owner_id
    where c.invite_code = upper(trim(p_code));
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.peek_contact_invite(text) from public, anon;
grant execute on function public.peek_contact_invite(text) to authenticated;
