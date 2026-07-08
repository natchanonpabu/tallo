// Package service owns all business logic and transactions. Handlers call into
// it; it never speaks HTTP. Split and clone run in a single tx. All money math
// is delegated to the money package.
package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"tallo_service/internal/store"
)

// Service is the business-logic entrypoint. It holds a pool for reads and
// simple writes, and begins transactions for split/clone.
type Service struct {
	pool *pgxpool.Pool
	q    *store.Queries
}

func New(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: store.New(pool)}
}

// ErrNotFound signals a missing resource; handlers map it to 404.
var ErrNotFound = errors.New("not found")

// ValidationError signals bad input; handlers map it to 400.
type ValidationError struct{ Message string }

func (e *ValidationError) Error() string { return e.Message }

func invalid(format string, a ...any) error {
	return &ValidationError{Message: fmt.Sprintf(format, a...)}
}

// notFoundIfNoRows converts pgx.ErrNoRows into ErrNotFound, passing other
// errors through untouched.
func notFoundIfNoRows(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// withTx runs fn inside a transaction, rolling back on error or panic.
func (s *Service) withTx(ctx context.Context, fn func(q *store.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback after commit is a no-op
	if err := fn(s.q.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// --- pgtype helpers for partial (PATCH) updates: nil pointer => leave column unchanged.

func optText(p *string) pgtype.Text {
	if p == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *p, Valid: true}
}

func optInt8(p *int64) pgtype.Int8 {
	if p == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *p, Valid: true}
}

func optInt4(p *int32) pgtype.Int4 {
	if p == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *p, Valid: true}
}
