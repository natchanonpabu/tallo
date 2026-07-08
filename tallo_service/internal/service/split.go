package service

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"tallo_service/internal/money"
	"tallo_service/internal/store"
)

type SplitParticipant struct {
	Name   string `json:"name"`
	Amount int64  `json:"amount"` // used only in manual mode
}

type SplitInput struct {
	Mode         string             `json:"mode"`
	IncludeMe    bool               `json:"includeMe"`
	Participants []SplitParticipant `json:"participants"`
}

// Split writes ledger entries into people's accounts for the shares others owe on
// an expense. The expense itself is untouched — the owner paid it in full
// (business.md #8). Even mode uses money.SplitEven (owner absorbs the remainder,
// gets no entry); manual mode takes amounts as given. Each entry is a snapshot
// (D1): source_expense_id is traceability only. Runs in one tx.
func (s *Service) Split(ctx context.Context, expenseID uuid.UUID, in SplitInput) (MonthFull, error) {
	expense, err := s.q.GetExpense(ctx, expenseID)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if len(in.Participants) == 0 {
		return MonthFull{}, invalid("at least one participant is required")
	}
	for _, p := range in.Participants {
		if p.Name == "" {
			return MonthFull{}, invalid("participant name is required")
		}
	}

	// Resolve each participant's ledger amount up front.
	amounts := make([]int64, len(in.Participants))
	switch in.Mode {
	case "even":
		n := len(in.Participants)
		if in.IncludeMe {
			n++ // the owner counts as a participant but never gets an entry
		}
		shares, _ := money.SplitEven(expense.Custom, n, in.IncludeMe)
		copy(amounts, shares)
	case "manual":
		for i, p := range in.Participants {
			amounts[i] = p.Amount
		}
	default:
		return MonthFull{}, invalid("invalid split mode %q", in.Mode)
	}

	err = s.withTx(ctx, func(q *store.Queries) error {
		for i, part := range in.Participants {
			personID, err := findOrCreatePerson(ctx, q, expense.MonthID, part.Name)
			if err != nil {
				return err
			}
			if _, err := q.CreateEntry(ctx, store.CreateEntryParams{
				PersonID:        personID,
				Label:           expense.Name,
				Amount:          amounts[i],
				SourceExpenseID: &expense.ID,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, expense.MonthID)
}

// findOrCreatePerson returns the id of the person with this name in the month,
// creating them if absent. Runs on the tx-bound queries so it sees its own writes.
func findOrCreatePerson(ctx context.Context, q *store.Queries, monthID uuid.UUID, name string) (uuid.UUID, error) {
	p, err := q.FindPersonByNameInMonth(ctx, store.FindPersonByNameInMonthParams{MonthID: monthID, Name: name})
	if err == nil {
		return p.ID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return uuid.UUID{}, err
	}
	created, err := q.CreatePerson(ctx, store.CreatePersonParams{MonthID: monthID, Name: name})
	if err != nil {
		return uuid.UUID{}, err
	}
	return created.ID, nil
}
