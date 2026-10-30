-- Link people with a code per contact (decided 2026-10-30): I get an invite code for my contact
-- "P'Nok", send it to them, and they enter it in their own app. Both sides end up linked.
-- This replaces asking the other person for their personal friend code (link_contact).

alter table public.contacts add column invite_code text unique;

drop function public.link_contact(uuid, text);

create function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, 1 + get_byte(bytes, i) % 32, 1);
    end loop;
    exit when not exists (select 1 from public.contacts where invite_code = code);
  end loop;
  return code;
end;
$$;

revoke execute on function public.generate_invite_code() from public, anon, authenticated;

-- The invite code of one of my unlinked contacts, created on first use.
create function public.contact_invite_code(p_contact_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts;
begin
  select * into v_contact from public.contacts
   where id = p_contact_id and owner_id = auth.uid()
   for update;
  if v_contact.id is null then
    raise exception 'contact_not_found' using errcode = 'P0002';
  end if;
  if v_contact.linked_user_id is not null then
    raise exception 'contact_already_linked' using errcode = '22023';
  end if;
  if v_contact.invite_code is null then
    update public.contacts set invite_code = public.generate_invite_code()
     where id = v_contact.id
    returning * into v_contact;
  end if;
  return v_contact.invite_code;
end;
$$;

-- The invited person enters the code. Their account is linked to the inviter's contact, and the
-- inviter is linked on their side too (an existing contact of theirs if given, otherwise a new one).
create function public.accept_contact_invite(p_code text, p_my_contact_id uuid default null)
returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.contacts;
  v_inviter public.profiles;
  v_mine public.contacts;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_invite from public.contacts where invite_code = upper(trim(p_code)) for update;
  if v_invite.id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if v_invite.owner_id = v_uid then
    raise exception 'cannot_link_self' using errcode = '22023';
  end if;
  if exists (select 1 from public.contacts where owner_id = v_invite.owner_id and linked_user_id = v_uid) then
    raise exception 'already_linked' using errcode = '22023';
  end if;

  update public.contacts set linked_user_id = v_uid, invite_code = null where id = v_invite.id;

  select * into v_inviter from public.profiles where id = v_invite.owner_id;

  -- My side: use the chosen contact, an existing link, or create one.
  if p_my_contact_id is not null then
    update public.contacts set linked_user_id = v_inviter.id, invite_code = null
     where id = p_my_contact_id and owner_id = v_uid and linked_user_id is null
    returning * into v_mine;
    if v_mine.id is null then
      raise exception 'contact_not_found' using errcode = 'P0002';
    end if;
  else
    select * into v_mine from public.contacts where owner_id = v_uid and linked_user_id = v_inviter.id;
    if v_mine.id is null then
      insert into public.contacts (owner_id, name, color, linked_user_id)
      values (v_uid, v_inviter.display_name, v_inviter.color, v_inviter.id)
      returning * into v_mine;
    end if;
  end if;

  perform public.notify(v_inviter.id, 'contact_linked', v_uid, null, null,
                        jsonb_build_object('contact_id', v_invite.id, 'contact_name', v_invite.name));
  return v_mine;
end;
$$;

create function public.unlink_contact(p_contact_id uuid)
returns public.contacts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts;
begin
  update public.contacts set linked_user_id = null
   where id = p_contact_id and owner_id = auth.uid()
  returning * into v_contact;
  if v_contact.id is null then
    raise exception 'contact_not_found' using errcode = 'P0002';
  end if;
  return v_contact;
end;
$$;

revoke execute on function public.contact_invite_code(uuid) from public, anon;
revoke execute on function public.accept_contact_invite(text, uuid) from public, anon;
revoke execute on function public.unlink_contact(uuid) from public, anon;
grant execute on function public.contact_invite_code(uuid) to authenticated;
grant execute on function public.accept_contact_invite(text, uuid) to authenticated;
grant execute on function public.unlink_contact(uuid) to authenticated;
