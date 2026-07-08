-- name: ListPeopleByMonth :many
select * from people
where month_id = $1
order by position, created_at, id;

-- name: GetPerson :one
select * from people where id = $1;

-- name: FindPersonByNameInMonth :one
select * from people
where month_id = $1 and name = $2
order by position, created_at, id
limit 1;

-- name: CreatePerson :one
insert into people (month_id, name, position)
values (
  sqlc.arg('month_id'),
  sqlc.arg('name'),
  (select coalesce(max(position) + 1, 0) from people where month_id = sqlc.arg('month_id'))
)
returning *;

-- name: UpdatePerson :one
update people set
  name     = coalesce(sqlc.narg('name'), name),
  status   = coalesce(sqlc.narg('status'), status),
  position = coalesce(sqlc.narg('position'), position)
where id = sqlc.arg('id')
returning *;

-- name: DeletePerson :exec
delete from people where id = $1;
