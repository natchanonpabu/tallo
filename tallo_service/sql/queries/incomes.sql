-- name: ListIncomesByMonth :many
select * from incomes
where month_id = $1
order by position, created_at, id;

-- name: GetIncome :one
select * from incomes where id = $1;

-- name: CreateIncome :one
insert into incomes (month_id, name, amount, position)
values (
  sqlc.arg('month_id'),
  sqlc.arg('name'),
  sqlc.arg('amount'),
  (select coalesce(max(position) + 1, 0) from incomes where month_id = sqlc.arg('month_id'))
)
returning *;

-- name: UpdateIncome :one
update incomes set
  name     = coalesce(sqlc.narg('name'), name),
  amount   = coalesce(sqlc.narg('amount'), amount),
  status   = coalesce(sqlc.narg('status'), status),
  position = coalesce(sqlc.narg('position'), position)
where id = sqlc.arg('id')
returning *;

-- name: DeleteIncome :exec
delete from incomes where id = $1;
