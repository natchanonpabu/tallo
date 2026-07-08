-- name: ListEntriesByMonth :many
select e.*
from ledger_entries e
join people p on p.id = e.person_id
where p.month_id = $1
order by e.person_id, e.created_at, e.id;

-- name: ListEntriesByPerson :many
select * from ledger_entries
where person_id = $1
order by created_at, id;

-- name: GetEntry :one
select * from ledger_entries where id = $1;

-- name: CreateEntry :one
insert into ledger_entries (person_id, label, amount, source_expense_id)
values (
  sqlc.arg('person_id'),
  sqlc.arg('label'),
  sqlc.arg('amount'),
  sqlc.narg('source_expense_id')
)
returning *;

-- name: UpdateEntry :one
update ledger_entries set
  label  = coalesce(sqlc.narg('label'), label),
  amount = coalesce(sqlc.narg('amount'), amount)
where id = sqlc.arg('id')
returning *;

-- name: DeleteEntry :exec
delete from ledger_entries where id = $1;

-- name: GetPersonMonthID :one
select month_id from people where id = $1;
