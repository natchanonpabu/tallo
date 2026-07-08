package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	tallohttp "tallo_service/internal/http"
	"tallo_service/internal/service"
)

// Full-stack integration test: router -> handler -> service -> store -> Postgres.
// Runs only when DATABASE_URL is set (schema must already be migrated).
func setup(t *testing.T) (*httptest.Server, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping HTTP integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	srv := httptest.NewServer(tallohttp.NewRouter(pool, ""))
	t.Cleanup(func() {
		srv.Close()
		pool.Close()
	})
	return srv, pool
}

// call issues a request and decodes the JSON month payload; fails on unexpected status.
func call(t *testing.T, srv *httptest.Server, method, path string, body any, wantStatus int) service.MonthFull {
	t.Helper()
	var m service.MonthFull
	status, raw := rawCall(t, srv, method, path, body)
	if status != wantStatus {
		t.Fatalf("%s %s: status=%d want=%d body=%s", method, path, status, wantStatus, raw)
	}
	if len(raw) > 0 && wantStatus < 300 {
		if err := json.Unmarshal(raw, &m); err != nil {
			t.Fatalf("decode month: %v (body=%s)", err, raw)
		}
	}
	return m
}

func rawCall(t *testing.T, srv *httptest.Server, method, path string, body any) (int, []byte) {
	t.Helper()
	var buf io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		buf = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, srv.URL+path, buf)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, raw
}

func personByName(m service.MonthFull, name string) (service.PersonDTO, bool) {
	for _, p := range m.People {
		if p.Name == name {
			return p, true
		}
	}
	return service.PersonDTO{}, false
}

func TestAPIFullFlow(t *testing.T) {
	srv, _ := setup(t)

	// Create a month.
	m := call(t, srv, "POST", "/api/months", map[string]string{"label": "ก.ค. 69"}, http.StatusOK)
	if m.ID == (uuid.UUID{}) || m.Label != "ก.ค. 69" {
		t.Fatalf("unexpected month: %+v", m)
	}
	monthID := m.ID.String()
	t.Cleanup(func() { rawCall(t, srv, "DELETE", "/api/months/"+monthID, nil) })

	// Add an expense (custom 100000 satang = ฿1000), pending.
	m = call(t, srv, "POST", "/api/months/"+monthID+"/expenses",
		map[string]any{"group": "บัตร / สินเชื่อ", "name": "KTC", "minimum": 100000, "custom": 100000}, http.StatusOK)
	if len(m.Expenses) != 1 {
		t.Fatalf("want 1 expense, got %d", len(m.Expenses))
	}
	expenseID := m.Expenses[0].ID.String()
	if m.Summary.ToPay != 100000 || m.Summary.Paid != 0 {
		t.Fatalf("after add expense: summary=%+v", m.Summary)
	}

	// Even split across 3 people (owner not included): 100000/3 = 33333 each,
	// owner absorbs remainder 1 and gets no entry (business.md #8).
	m = call(t, srv, "POST", "/api/expenses/"+expenseID+"/split", map[string]any{
		"mode":      "even",
		"includeMe": false,
		"participants": []map[string]string{
			{"name": "Person A"}, {"name": "Person B"}, {"name": "Person C"},
		},
	}, http.StatusOK)
	if len(m.People) != 3 {
		t.Fatalf("want 3 people after split, got %d", len(m.People))
	}
	var sumNet int64
	for _, p := range m.People {
		if p.Net != 33333 {
			t.Errorf("person %s net = %d, want 33333", p.Name, p.Net)
		}
		if len(p.Entries) != 1 || p.Entries[0].Label != "KTC" {
			t.Errorf("person %s entries = %+v", p.Name, p.Entries)
		}
		if p.Entries[0].SourceExpenseID == nil || p.Entries[0].SourceExpenseID.String() != expenseID {
			t.Errorf("person %s missing sourceExpenseId", p.Name)
		}
		sumNet += p.Net
	}
	if sumNet != 99999 {
		t.Errorf("sum of non-owner shares = %d, want 99999 (owner absorbs 1)", sumNet)
	}
	// Splitting does NOT reduce the expense (owner paid in full).
	if m.Expenses[0].Custom != 100000 {
		t.Errorf("split changed expense custom to %d", m.Expenses[0].Custom)
	}
	// Three pending receivables of 33333 => toReceive; expense still pending 100000.
	if m.Summary.ToReceive != 99999 || m.Summary.ToPay != 100000 {
		t.Errorf("post-split summary = %+v", m.Summary)
	}

	// D1: editing the source expense must NOT change the snapshot entries.
	m = call(t, srv, "PATCH", "/api/expenses/"+expenseID, map[string]any{"custom": 999999}, http.StatusOK)
	if pa, _ := personByName(m, "Person A"); pa.Net != 33333 {
		t.Errorf("D1 violated: entry changed to %d after expense edit", pa.Net)
	}

	// Toggle a person to settled: their +33333 moves from toReceive to received.
	pb, _ := personByName(m, "Person B")
	m = call(t, srv, "PATCH", "/api/people/"+pb.ID.String(), map[string]any{"status": "settled"}, http.StatusOK)
	if m.Summary.Received != 33333 || m.Summary.ToReceive != 66666 {
		t.Errorf("after settle: summary=%+v", m.Summary)
	}

	// Add a negative (offset) entry to Person A: they paid the owner back.
	pa, _ := personByName(m, "Person A")
	m = call(t, srv, "POST", "/api/people/"+pa.ID.String()+"/entries",
		map[string]any{"label": "Durian", "amount": -56000}, http.StatusOK)
	if pa2, _ := personByName(m, "Person A"); pa2.Net != 33333-56000 {
		t.Errorf("Person A net after offset = %d, want %d", pa2.Net, int64(33333-56000))
	}

	// Add income, mark received.
	m = call(t, srv, "POST", "/api/months/"+monthID+"/incomes",
		map[string]any{"name": "เงินเดือน", "amount": 5335000}, http.StatusOK)
	incomeID := m.Incomes[0].ID.String()
	m = call(t, srv, "PATCH", "/api/incomes/"+incomeID, map[string]any{"status": "received"}, http.StatusOK)
	if m.Summary.Received < 5335000 {
		t.Errorf("income not counted: %+v", m.Summary)
	}
}

func TestAPICloneAndValidation(t *testing.T) {
	srv, _ := setup(t)

	m := call(t, srv, "POST", "/api/months", map[string]string{"label": "src"}, http.StatusOK)
	srcID := m.ID.String()
	t.Cleanup(func() { rawCall(t, srv, "DELETE", "/api/months/"+srcID, nil) })

	m = call(t, srv, "POST", "/api/months/"+srcID+"/expenses",
		map[string]any{"name": "Rent", "custom": 500000}, http.StatusOK)
	expID := m.Expenses[0].ID
	// Mark it paid so we can prove clone resets status.
	m = call(t, srv, "PATCH", "/api/expenses/"+expID.String(), map[string]any{"status": "paid"}, http.StatusOK)
	m = call(t, srv, "POST", "/api/months/"+srcID+"/incomes",
		map[string]any{"name": "Salary", "amount": 5000000}, http.StatusOK)
	incID := m.Incomes[0].ID
	// Add a person — must NOT be carried by clone.
	m = call(t, srv, "POST", "/api/months/"+srcID+"/people", map[string]any{"name": "Person X"}, http.StatusOK)

	// Clone carrying both items.
	cloned := call(t, srv, "POST", "/api/months/"+srcID+"/clone", map[string]any{
		"label":      "ส.ค. 69",
		"expenseIds": []string{expID.String()},
		"incomeIds":  []string{incID.String()},
	}, http.StatusOK)
	newID := cloned.ID.String()
	t.Cleanup(func() { rawCall(t, srv, "DELETE", "/api/months/"+newID, nil) })

	if cloned.Label != "ส.ค. 69" {
		t.Errorf("clone label = %q", cloned.Label)
	}
	if len(cloned.Expenses) != 1 || cloned.Expenses[0].Name != "Rent" {
		t.Fatalf("clone expenses = %+v", cloned.Expenses)
	}
	if cloned.Expenses[0].Status != "pending" {
		t.Errorf("clone did not reset expense status: %q", cloned.Expenses[0].Status)
	}
	if len(cloned.Incomes) != 1 || cloned.Incomes[0].Status != "pending" {
		t.Errorf("clone income = %+v", cloned.Incomes)
	}
	if len(cloned.People) != 0 {
		t.Errorf("clone must not carry people, got %d", len(cloned.People))
	}

	// Validation: bad status -> 400.
	if status, _ := rawCall(t, srv, "PATCH", "/api/expenses/"+expID.String(),
		map[string]any{"status": "banana"}); status != http.StatusBadRequest {
		t.Errorf("bad status: got %d want 400", status)
	}
	// Missing month -> 404.
	if status, _ := rawCall(t, srv, "GET", "/api/months/"+uuid.NewString(), nil); status != http.StatusNotFound {
		t.Errorf("missing month: got %d want 404", status)
	}
	// Malformed UUID -> 400.
	if status, _ := rawCall(t, srv, "GET", "/api/months/not-a-uuid", nil); status != http.StatusBadRequest {
		t.Errorf("bad uuid: got %d want 400", status)
	}
}
