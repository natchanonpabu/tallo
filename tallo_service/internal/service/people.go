package service

import (
	"context"

	"github.com/google/uuid"

	"tallo_service/internal/store"
)

type PersonCreate struct {
	Name string `json:"name"`
}

type PersonPatch struct {
	Name     *string `json:"name"`
	Status   *string `json:"status"`
	Position *int32  `json:"position"`
}

type EntryCreate struct {
	Label  string `json:"label"`
	Amount int64  `json:"amount"`
}

type EntryPatch struct {
	Label  *string `json:"label"`
	Amount *int64  `json:"amount"`
}

func parsePersonStatus(s string) (store.PersonStatus, error) {
	switch store.PersonStatus(s) {
	case store.PersonStatusPending, store.PersonStatusSettled:
		return store.PersonStatus(s), nil
	}
	return "", invalid("invalid person status %q", s)
}

func (s *Service) CreatePerson(ctx context.Context, monthID uuid.UUID, in PersonCreate) (MonthFull, error) {
	if in.Name == "" {
		return MonthFull{}, invalid("name is required")
	}
	if _, err := s.q.GetMonth(ctx, monthID); err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if _, err := s.q.CreatePerson(ctx, store.CreatePersonParams{MonthID: monthID, Name: in.Name}); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, monthID)
}

func (s *Service) UpdatePerson(ctx context.Context, id uuid.UUID, in PersonPatch) (MonthFull, error) {
	person, err := s.q.GetPerson(ctx, id)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}

	params := store.UpdatePersonParams{
		ID:       id,
		Name:     optText(in.Name),
		Position: optInt4(in.Position),
	}
	if in.Status != nil {
		st, err := parsePersonStatus(*in.Status)
		if err != nil {
			return MonthFull{}, err
		}
		params.Status = store.NullPersonStatus{PersonStatus: st, Valid: true}
	}
	if _, err := s.q.UpdatePerson(ctx, params); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, person.MonthID)
}

func (s *Service) DeletePerson(ctx context.Context, id uuid.UUID) (MonthFull, error) {
	person, err := s.q.GetPerson(ctx, id)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if err := s.q.DeletePerson(ctx, id); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, person.MonthID)
}

// CreateEntry appends a signed ledger entry to a person (manual, no source expense).
func (s *Service) CreateEntry(ctx context.Context, personID uuid.UUID, in EntryCreate) (MonthFull, error) {
	monthID, err := s.q.GetPersonMonthID(ctx, personID)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if _, err := s.q.CreateEntry(ctx, store.CreateEntryParams{
		PersonID:        personID,
		Label:           in.Label,
		Amount:          in.Amount,
		SourceExpenseID: nil,
	}); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, monthID)
}

func (s *Service) UpdateEntry(ctx context.Context, id uuid.UUID, in EntryPatch) (MonthFull, error) {
	entry, err := s.q.GetEntry(ctx, id)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	monthID, err := s.q.GetPersonMonthID(ctx, entry.PersonID)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if _, err := s.q.UpdateEntry(ctx, store.UpdateEntryParams{
		ID:     id,
		Label:  optText(in.Label),
		Amount: optInt8(in.Amount),
	}); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, monthID)
}

func (s *Service) DeleteEntry(ctx context.Context, id uuid.UUID) (MonthFull, error) {
	entry, err := s.q.GetEntry(ctx, id)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	monthID, err := s.q.GetPersonMonthID(ctx, entry.PersonID)
	if err != nil {
		return MonthFull{}, notFoundIfNoRows(err)
	}
	if err := s.q.DeleteEntry(ctx, id); err != nil {
		return MonthFull{}, err
	}
	return s.buildMonth(ctx, monthID)
}
