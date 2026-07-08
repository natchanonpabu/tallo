package service

import (
	"time"

	"github.com/google/uuid"

	"tallo_service/internal/store"
)

// These structs are the JSON shapes from design.md #5. camelCase, satang ints,
// UUIDs as strings, timestamps RFC3339. Computed values (net, summary) are built
// on read and never stored.

type MonthListItem struct {
	ID        uuid.UUID `json:"id"`
	Label     string    `json:"label"`
	CreatedAt time.Time `json:"createdAt"`
}

type MonthFull struct {
	ID        uuid.UUID    `json:"id"`
	Label     string       `json:"label"`
	CreatedAt time.Time    `json:"createdAt"`
	Expenses  []ExpenseDTO `json:"expenses"`
	Incomes   []IncomeDTO  `json:"incomes"`
	People    []PersonDTO  `json:"people"`
	Summary   Summary      `json:"summary"`
}

type ExpenseDTO struct {
	ID       uuid.UUID `json:"id"`
	Group    string    `json:"group"`
	Name     string    `json:"name"`
	Amount   int64     `json:"amount"`
	Minimum  int64     `json:"minimum"`
	Custom   int64     `json:"custom"`
	Status   string    `json:"status"`
	Position int32     `json:"position"`
}

type IncomeDTO struct {
	ID       uuid.UUID `json:"id"`
	Name     string    `json:"name"`
	Amount   int64     `json:"amount"`
	Status   string    `json:"status"`
	Position int32     `json:"position"`
}

type PersonDTO struct {
	ID       uuid.UUID  `json:"id"`
	Name     string     `json:"name"`
	Status   string     `json:"status"`
	Net      int64      `json:"net"`
	Position int32      `json:"position"`
	Entries  []EntryDTO `json:"entries"`
}

type EntryDTO struct {
	ID              uuid.UUID  `json:"id"`
	Label           string     `json:"label"`
	Amount          int64      `json:"amount"`
	SourceExpenseID *uuid.UUID `json:"sourceExpenseId"`
}

func expenseDTO(e store.Expense) ExpenseDTO {
	return ExpenseDTO{
		ID:       e.ID,
		Group:    e.Grp,
		Name:     e.Name,
		Amount:   e.Amount,
		Minimum:  e.Minimum,
		Custom:   e.Custom,
		Status:   string(e.Status),
		Position: e.Position,
	}
}

func incomeDTO(in store.Income) IncomeDTO {
	return IncomeDTO{
		ID:       in.ID,
		Name:     in.Name,
		Amount:   in.Amount,
		Status:   string(in.Status),
		Position: in.Position,
	}
}

func entryDTO(en store.LedgerEntry) EntryDTO {
	return EntryDTO{
		ID:              en.ID,
		Label:           en.Label,
		Amount:          en.Amount,
		SourceExpenseID: en.SourceExpenseID,
	}
}
