package service

import "tallo_service/internal/store"

// Summary is the five dashboard numbers (design.md #4, business.md #9). Always
// computed on read, never stored.
type Summary struct {
	Paid      int64 `json:"paid"`
	ToPay     int64 `json:"toPay"`
	Received  int64 `json:"received"`
	ToReceive int64 `json:"toReceive"`
	CashNow   int64 `json:"cashNow"`
}

// personNet is a person's settle status paired with their computed net.
type personNet struct {
	status store.PersonStatus
	net    int64
}

// computeSummary folds expenses (by custom), direct incomes, and person nets into
// the five totals. A person's net is signed: positive is a receivable, negative a
// payable (business.md #7, D2). net == 0 contributes nothing.
func computeSummary(expenses []store.Expense, incomes []store.Income, people []personNet) Summary {
	var s Summary

	for _, e := range expenses {
		if e.Status == store.ExpenseStatusPaid {
			s.Paid += e.Custom
		} else {
			s.ToPay += e.Custom
		}
	}

	for _, in := range incomes {
		if in.Status == store.IncomeStatusReceived {
			s.Received += in.Amount
		} else {
			s.ToReceive += in.Amount
		}
	}

	for _, p := range people {
		switch {
		case p.net > 0 && p.status == store.PersonStatusSettled:
			s.Received += p.net
		case p.net > 0: // pending receivable
			s.ToReceive += p.net
		case p.net < 0 && p.status == store.PersonStatusSettled:
			s.Paid += -p.net
		case p.net < 0: // pending payable
			s.ToPay += -p.net
		}
	}

	s.CashNow = s.Received - s.Paid
	return s
}
