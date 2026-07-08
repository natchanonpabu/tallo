package store_test

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"tallo_service/internal/store"
)

// Integration smoke test: proves google/uuid.UUID scans/encodes through pgx/v5,
// nullable uuid, uuid[] array params (clone), timestamptz, and enums all round-trip
// against a real Postgres. Runs only when DATABASE_URL is set.
func TestStoreRoundTrip(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping integration test")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	defer pool.Close()
	q := store.New(pool)

	// month
	m, err := q.CreateMonth(ctx, "ก.ค. 69")
	if err != nil {
		t.Fatalf("CreateMonth: %v", err)
	}
	if m.ID.String() == "00000000-0000-0000-0000-000000000000" {
		t.Fatalf("month ID not populated: %v", m.ID)
	}
	if m.UserID != nil {
		t.Fatalf("expected nil UserID, got %v", m.UserID)
	}
	if m.CreatedAt.IsZero() {
		t.Fatalf("CreatedAt not scanned")
	}

	// expense (drives enum default + returning)
	e, err := q.CreateExpense(ctx, store.CreateExpenseParams{
		MonthID: m.ID, Grp: "บัตร / สินเชื่อ", Name: "KTC", Amount: 0, Minimum: 1272900, Custom: 1272900,
	})
	if err != nil {
		t.Fatalf("CreateExpense: %v", err)
	}
	if e.Status != store.ExpenseStatusPending {
		t.Fatalf("expected pending, got %v", e.Status)
	}

	// person + entries: one with source_expense_id (non-null uuid ptr), one without (null)
	p, err := q.CreatePerson(ctx, store.CreatePersonParams{MonthID: m.ID, Name: "Person B"})
	if err != nil {
		t.Fatalf("CreatePerson: %v", err)
	}
	if _, err := q.CreateEntry(ctx, store.CreateEntryParams{
		PersonID: p.ID, Label: "KTC", Amount: 947900, SourceExpenseID: &e.ID,
	}); err != nil {
		t.Fatalf("CreateEntry with source: %v", err)
	}
	if _, err := q.CreateEntry(ctx, store.CreateEntryParams{
		PersonID: p.ID, Label: "Durian", Amount: -56000, SourceExpenseID: nil,
	}); err != nil {
		t.Fatalf("CreateEntry null source: %v", err)
	}

	entries, err := q.ListEntriesByMonth(ctx, m.ID)
	if err != nil {
		t.Fatalf("ListEntriesByMonth: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	var withSource, withoutSource int
	var net int64
	for _, en := range entries {
		net += en.Amount
		if en.SourceExpenseID != nil {
			withSource++
			if *en.SourceExpenseID != e.ID {
				t.Fatalf("source_expense_id round-trip mismatch: %v vs %v", *en.SourceExpenseID, e.ID)
			}
		} else {
			withoutSource++
		}
	}
	if withSource != 1 || withoutSource != 1 {
		t.Fatalf("expected 1 with / 1 without source, got %d / %d", withSource, withoutSource)
	}
	if net != 947900-56000 {
		t.Fatalf("net mismatch: %d", net)
	}

	// clone: exercises uuid[] array param
	m2, err := q.CreateMonth(ctx, "ส.ค. 69")
	if err != nil {
		t.Fatalf("CreateMonth 2: %v", err)
	}
	if err := q.CloneExpenses(ctx, store.CloneExpensesParams{
		NewMonthID: m2.ID, SourceMonthID: m.ID, Ids: []uuid.UUID{e.ID},
	}); err != nil {
		t.Fatalf("CloneExpenses: %v", err)
	}
	cloned, err := q.ListExpensesByMonth(ctx, m2.ID)
	if err != nil {
		t.Fatalf("ListExpensesByMonth cloned: %v", err)
	}
	if len(cloned) != 1 || cloned[0].Name != "KTC" || cloned[0].Status != store.ExpenseStatusPending {
		t.Fatalf("clone mismatch: %+v", cloned)
	}

	// cleanup
	if err := q.DeleteMonth(ctx, m.ID); err != nil {
		t.Fatalf("DeleteMonth: %v", err)
	}
	if err := q.DeleteMonth(ctx, m2.ID); err != nil {
		t.Fatalf("DeleteMonth 2: %v", err)
	}
}
