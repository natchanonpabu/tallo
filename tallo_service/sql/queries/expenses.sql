-- name: ListExpensesByMonth :many
select * from expenses
where month_id = $1
order by position, created_at, id;

-- name: GetExpense :one
select * from expenses where id = $1;

-- name: CreateExpense :one
insert into expenses (month_id, grp, name, amount, minimum, custom, position)
values (
  sqlc.arg('month_id'),
  sqlc.arg('grp'),
  sqlc.arg('name'),
  sqlc.arg('amount'),
  sqlc.arg('minimum'),
  sqlc.arg('custom'),
  (select coalesce(max(position) + 1, 0) from expenses where month_id = sqlc.arg('month_id'))
)
returning *;

-- name: UpdateExpense :one
update expenses set
  grp      = coalesce(sqlc.narg('grp'), grp),
  name     = coalesce(sqlc.narg('name'), name),
  amount   = coalesce(sqlc.narg('amount'), amount),
  minimum  = coalesce(sqlc.narg('minimum'), minimum),
  custom   = coalesce(sqlc.narg('custom'), custom),
  status   = coalesce(sqlc.narg('status'), status),
  position = coalesce(sqlc.narg('position'), position)
where id = sqlc.arg('id')
returning *;

-- name: DeleteExpense :exec
delete from expenses where id = $1;
