package service

import (
	"context"

	"github.com/google/uuid"

	"tallo_service/internal/store"
)

// buildMonth assembles the full month payload: rows + per-person nets + summary.
// It reads committed state on the pool, so callers that mutate inside a tx should
// commit first. Returns ErrNotFound if the month does not exist.
func (s *Service) buildMonth(ctx context.Context, monthID uuid.UUID) (MonthFull, error) {
	m, err := s.q.GetMonth(ctx, monthID)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}

	expenses, err := s.q.ListExpensesByMonth(ctx, monthID)
	if err != nil {
		return MonthFull{}, err
	}
	incomes, err := s.q.ListIncomesByMonth(ctx, monthID)
	if err != nil {
		return MonthFull{}, err
	}
	people, err := s.q.ListPeopleByMonth(ctx, monthID)
	if err != nil {
		return MonthFull{}, err
	}
	entries, err := s.q.ListEntriesByMonth(ctx, monthID)
	if err != nil {
		return MonthFull{}, err
	}

	// Group entries by person and sum nets in one pass.
	entriesByPerson := make(map[uuid.UUID][]store.LedgerEntry, len(people))
	for _, en := range entries {
		entriesByPerson[en.PersonID] = append(entriesByPerson[en.PersonID], en)
	}

	full := MonthFull{
		ID:        m.ID,
		Label:     m.Label,
		CreatedAt: m.CreatedAt,
		Expenses:  make([]ExpenseDTO, 0, len(expenses)),
		Incomes:   make([]IncomeDTO, 0, len(incomes)),
		People:    make([]PersonDTO, 0, len(people)),
	}
	for _, e := range expenses {
		full.Expenses = append(full.Expenses, expenseDTO(e))
	}
	for _, in := range incomes {
		full.Incomes = append(full.Incomes, incomeDTO(in))
	}

	nets := make([]personNet, 0, len(people))
	for _, p := range people {
		pes := entriesByPerson[p.ID]
		var net int64
		entryDTOs := make([]EntryDTO, 0, len(pes))
		for _, en := range pes {
			net += en.Amount
			entryDTOs = append(entryDTOs, entryDTO(en))
		}
		full.People = append(full.People, PersonDTO{
			ID:       p.ID,
			Name:     p.Name,
			Status:   string(p.Status),
			Net:      net,
			Position: p.Position,
			Entries:  entryDTOs,
		})
		nets = append(nets, personNet{status: p.Status, net: net})
	}

	full.Summary = computeSummary(expenses, incomes, nets)
	return full, nil
}

// ListMonths returns months newest first.
func (s *Service) ListMonths(ctx context.Context) ([]MonthListItem, error) {
	rows, err := s.q.ListMonths(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]MonthListItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, MonthListItem{ID: r.ID, Label: r.Label, CreatedAt: r.CreatedAt})
	}
	return out, nil
}

// CreateMonth makes an empty named month.
func (s *Service) CreateMonth(ctx context.Context, label string) (MonthFull, error) {
	if label == "" {
		return MonthFull{}, invalid("label is required")
	}
	m, err := s.q.CreateMonth(ctx, label)
	if err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, m.ID)
}

// GetMonth returns the full month payload.
func (s *Service) GetMonth(ctx context.Context, monthID uuid.UUID) (MonthFull, error) {
	return s.buildMonth(ctx, monthID)
}

// DeleteMonth cascade-deletes the month and everything in it.
func (s *Service) DeleteMonth(ctx context.Context, monthID uuid.UUID) error {
	if _, err := s.q.GetMonth(ctx, monthID); err != nil {
		return notFoundIfNoRows(err)
	}
	return s.q.DeleteMonth(ctx, monthID)
}

// CloneInput selects which items to carry into a new cycle.
type CloneInput struct {
	Label      string      `json:"label"`
	ExpenseIDs []uuid.UUID `json:"expenseIds"`
	IncomeIDs  []uuid.UUID `json:"incomeIds"`
}

// Clone opens a new cycle: a fresh month carrying the chosen expenses and direct
// incomes (status reset to pending). People and ledgers are never carried
// (business.md #10). Runs in one tx.
func (s *Service) Clone(ctx context.Context, sourceID uuid.UUID, in CloneInput) (MonthFull, error) {
	if in.Label == "" {
		return MonthFull{}, invalid("label is required")
	}
	if _, err := s.q.GetMonth(ctx, sourceID); err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}

	var newID uuid.UUID
	err := s.withTx(ctx, func(q *store.Queries) error {
		m, err := q.CreateMonth(ctx, in.Label)
		if err != nil {
			return err
		}
		newID = m.ID
		if len(in.ExpenseIDs) > 0 {
			if err := q.CloneExpenses(ctx, store.CloneExpensesParams{
				NewMonthID:    newID,
				SourceMonthID: sourceID,
				Ids:           in.ExpenseIDs,
			}); err != nil {
				return err
			}
		}
		if len(in.IncomeIDs) > 0 {
			if err := q.CloneIncomes(ctx, store.CloneIncomesParams{
				NewMonthID:    newID,
				SourceMonthID: sourceID,
				Ids:           in.IncomeIDs,
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, newID)
}
