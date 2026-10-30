-- Delete a contact (business.md §3). Without p_force it only deletes a contact nobody refers to;
-- with p_force it also removes their shares, offsets, settlements and sent requests. Rows in a
-- closed month stay locked by the month guards, so such contacts can only be archived.

create function public.delete_contact(p_contact_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rule_ids uuid[];
begin
  if not exists (select 1 from public.contacts where id = p_contact_id and owner_id = v_uid) then
    raise exception 'contact_not_found' using errcode = 'P0002';
  end if;

  if not p_force and (
       exists (select 1 from public.shares where contact_id = p_contact_id)
    or exists (select 1 from public.offsets where contact_id = p_contact_id)
    or exists (select 1 from public.settlements where contact_id = p_contact_id)
    or exists (select 1 from public.payment_requests where sender_contact_id = p_contact_id)) then
    raise exception 'contact_in_use' using errcode = '23503';
  end if;

  if exists (
       select 1 from public.shares s join public.months m on m.id = s.month_id
        where s.contact_id = p_contact_id and m.status = 'closed'
       union all
       select 1 from public.offsets o join public.months m on m.id = o.month_id
        where o.contact_id = p_contact_id and m.status = 'closed') then
    raise exception 'contact_in_closed_month' using errcode = '22023';
  end if;

  -- Splits that only had this person become empty; drop those rules too.
  select array_agg(distinct rule_id) into v_rule_ids from public.shares where contact_id = p_contact_id;
  delete from public.shares where contact_id = p_contact_id;
  delete from public.split_rules r
   where r.id = any (coalesce(v_rule_ids, '{}'))
     and not exists (select 1 from public.shares s where s.rule_id = r.id);

  delete from public.offsets where contact_id = p_contact_id;
  delete from public.settlements where contact_id = p_contact_id;
  delete from public.payment_requests where sender_contact_id = p_contact_id;
  delete from public.contacts where id = p_contact_id;
end;
$$;

revoke execute on function public.delete_contact(uuid, boolean) from public, anon;
grant execute on function public.delete_contact(uuid, boolean) to authenticated;
