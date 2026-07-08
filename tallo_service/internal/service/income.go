package service

import (
	"context"

	"github.com/google/uuid"

	"tallo_service/internal/store"
)

type IncomeCreate struct {
	Name   string `json:"name"`
	Amount int64  `json:"amount"`
}

type IncomePatch struct {
	Name     *string `json:"name"`
	Amount   *int64  `json:"amount"`
	Status   *string `json:"status"`
	Position *int32  `json:"position"`
}

func parseIncomeStatus(s string) (store.IncomeStatus, error) {
	switch store.IncomeStatus(s) {
	case store.IncomeStatusPending, store.IncomeStatusReceived:
		return store.IncomeStatus(s), nil
	}
	return "", invalid("invalid income status %q", s)
}

func (s *Service) CreateIncome(ctx context.Context, monthID uuid.UUID, in IncomeCreate) (MonthFull, error) {
	if _, err := s.q.GetMonth(ctx, monthID); err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if _, err := s.q.CreateIncome(ctx, store.CreateIncomeParams{
		MonthID: monthID,
		Name:    in.Name,
		Amount:  in.Amount,
	}); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, monthID)
}

func (s *Service) UpdateIncome(ctx context.Context, id uuid.UUID, in IncomePatch) (MonthFull, error) {
	existing, err := s.q.GetIncome(ctx, id)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}

	params := store.UpdateIncomeParams{
		ID:       id,
		Name:     optText(in.Name),
		Amount:   optInt8(in.Amount),
		Position: optInt4(in.Position),
	}
	if in.Status != nil {
		st, err := parseIncomeStatus(*in.Status)
		if err != nil {
			return MonthFull{}, err
		}
		params.Status = store.NullIncomeStatus{IncomeStatus: st, Valid: true}
	}
	if _, err := s.q.UpdateIncome(ctx, params); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, existing.MonthID)
}

func (s *Service) DeleteIncome(ctx context.Context, id uuid.UUID) (MonthFull, error) {
	existing, err := s.q.GetIncome(ctx, id)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if err := s.q.DeleteIncome(ctx, id); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, existing.MonthID)
}
