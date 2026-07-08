package service

import (
	"context"

	"github.com/google/uuid"

	"tallo_service/internal/store"
)

// ExpenseCreate is the POST body; group/name default to "", figures to 0.
type ExpenseCreate struct {
	Group   string `json:"group"`
	Name    string `json:"name"`
	Amount  int64  `json:"amount"`
	Minimum int64  `json:"minimum"`
	Custom  int64  `json:"custom"`
}

// ExpensePatch is the PATCH body; nil fields are left unchanged.
type ExpensePatch struct {
	Group    *string `json:"group"`
	Name     *string `json:"name"`
	Amount   *int64  `json:"amount"`
	Minimum  *int64  `json:"minimum"`
	Custom   *int64  `json:"custom"`
	Status   *string `json:"status"`
	Position *int32  `json:"position"`
}

func parseExpenseStatus(s string) (store.ExpenseStatus, error) {
	switch store.ExpenseStatus(s) {
	case store.ExpenseStatusPending, store.ExpenseStatusPaid:
		return store.ExpenseStatus(s), nil
	}
	return "", invalid("invalid expense status %q", s)
}

func (s *Service) CreateExpense(ctx context.Context, monthID uuid.UUID, in ExpenseCreate) (MonthFull, error) {
	if _, err := s.q.GetMonth(ctx, monthID); err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if _, err := s.q.CreateExpense(ctx, store.CreateExpenseParams{
		MonthID: monthID,
		Grp:     in.Group,
		Name:    in.Name,
		Amount:  in.Amount,
		Minimum: in.Minimum,
		Custom:  in.Custom,
	}); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, monthID)
}

func (s *Service) UpdateExpense(ctx context.Context, id uuid.UUID, in ExpensePatch) (MonthFull, error) {
	existing, err := s.q.GetExpense(ctx, id)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}

	params := store.UpdateExpenseParams{
		ID:       id,
		Grp:      optText(in.Group),
		Name:     optText(in.Name),
		Amount:   optInt8(in.Amount),
		Minimum:  optInt8(in.Minimum),
		Custom:   optInt8(in.Custom),
		Position: optInt4(in.Position),
	}
	if in.Status != nil {
		st, err := parseExpenseStatus(*in.Status)
		if err != nil {
			return MonthFull{}, err
		}
		params.Status = store.NullExpenseStatus{ExpenseStatus: st, Valid: true}
	}
	if _, err := s.q.UpdateExpense(ctx, params); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, existing.MonthID)
}

func (s *Service) DeleteExpense(ctx context.Context, id uuid.UUID) (MonthFull, error) {
	existing, err := s.q.GetExpense(ctx, id)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if err := s.q.DeleteExpense(ctx, id); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, existing.MonthID)
}
