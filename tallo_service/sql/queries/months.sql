-- name: ListMonths :many
select id, label, created_at
from months
order by created_at desc, id desc;

-- name: GetMonth :one
select * from months where id = $1;

-- name: CreateMonth :one
insert into months (label) values ($1)
returning *;

-- name: DeleteMonth :exec
delete from months where id = $1;

-- name: CloneExpenses :exec
insert into expenses (month_id, grp, name, amount, minimum, custom, status, position)
select sqlc.arg('new_month_id')::uuid, grp, name, amount, minimum, custom, 'pending', position
from expenses
where month_id = sqlc.arg('source_month_id')::uuid
  and id = any(sqlc.arg('ids')::uuid[]);

-- name: CloneIncomes :exec
insert into incomes (month_id, name, amount, status, position)
select sqlc.arg('new_month_id')::uuid, name, amount, 'pending', position
from incomes
where month_id = sqlc.arg('source_month_id')::uuid
  and id = any(sqlc.arg('ids')::uuid[]);
