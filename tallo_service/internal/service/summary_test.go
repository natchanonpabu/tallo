package service

import (
	"testing"

	"tallo_service/internal/store"
)

func exp(custom int64, st store.ExpenseStatus) store.Expense {
	return store.Expense{Custom: custom, Status: st}
}

func inc(amount int64, st store.IncomeStatus) store.Income {
	return store.Income{Amount: amount, Status: st}
}

func TestComputeSummary(t *testing.T) {
	cases := []struct {
		name     string
		expenses []store.Expense
		incomes  []store.Income
		people   []personNet
		want     Summary
	}{
		{
			name: "empty month is all zeros",
			want: Summary{},
		},
		{
			name:     "expenses split by status",
			expenses: []store.Expense{exp(100000, store.ExpenseStatusPaid), exp(50000, store.ExpenseStatusPending)},
			want:     Summary{Paid: 100000, ToPay: 50000, CashNow: -100000},
		},
		{
			name:    "incomes split by status",
			incomes: []store.Income{inc(5335000, store.IncomeStatusReceived), inc(601000, store.IncomeStatusPending)},
			want:    Summary{Received: 5335000, ToReceive: 601000, CashNow: 5335000},
		},
		{
			name: "positive net pending is a receivable to-receive",
			people: []personNet{
				{status: store.PersonStatusPending, net: 601000},
			},
			want: Summary{ToReceive: 601000},
		},
		{
			name: "positive net settled is received",
			people: []personNet{
				{status: store.PersonStatusSettled, net: 601000},
			},
			want: Summary{Received: 601000, CashNow: 601000},
		},
		{
			name: "negative net pending is a payable to-pay (D2)",
			people: []personNet{
				{status: store.PersonStatusPending, net: -56000},
			},
			want: Summary{ToPay: 56000},
		},
		{
			name: "negative net settled is paid (D2)",
			people: []personNet{
				{status: store.PersonStatusSettled, net: -56000},
			},
			want: Summary{Paid: 56000, CashNow: -56000},
		},
		{
			name: "zero net contributes nothing",
			people: []personNet{
				{status: store.PersonStatusPending, net: 0},
				{status: store.PersonStatusSettled, net: 0},
			},
			want: Summary{},
		},
		{
			name:     "all four quadrants combined",
			expenses: []store.Expense{exp(100000, store.ExpenseStatusPaid), exp(50000, store.ExpenseStatusPending)},
			incomes:  []store.Income{inc(5335000, store.IncomeStatusReceived), inc(601000, store.IncomeStatusPending)},
			people: []personNet{
				{status: store.PersonStatusSettled, net: 600000}, // received
				{status: store.PersonStatusPending, net: 601000}, // toReceive
				{status: store.PersonStatusSettled, net: -40000}, // paid
				{status: store.PersonStatusPending, net: -25000}, // toPay
				{status: store.PersonStatusPending, net: 0},      // ignored
			},
			want: Summary{
				Paid:      140000,  // 100000 + 40000
				ToPay:     75000,   // 50000 + 25000
				Received:  5935000, // 5335000 + 600000
				ToReceive: 1202000, // 601000 + 601000
				CashNow:   5795000, // 5935000 - 140000
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := computeSummary(tc.expenses, tc.incomes, tc.people)
			if got != tc.want {
				t.Errorf("computeSummary()\n got  = %+v\n want = %+v", got, tc.want)
			}
		})
	}
}
