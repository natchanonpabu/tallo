package http

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"tallo_service/internal/service"
)

type handler struct {
	svc *service.Service
}

// NewRouter wires the service, CORS, and all /api routes.
func NewRouter(pool *pgxpool.Pool, corsOrigin string) http.Handler {
	h := &handler{svc: service.New(pool)}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware(corsOrigin))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		// Months
		r.Get("/months", h.listMonths)
		r.Post("/months", h.createMonth)
		r.Get("/months/{id}", h.getMonth)
		r.Delete("/months/{id}", h.deleteMonth)
		r.Post("/months/{id}/clone", h.cloneMonth)

		// Nested creates
		r.Post("/months/{id}/expenses", h.createExpense)
		r.Post("/months/{id}/incomes", h.createIncome)
		r.Post("/months/{id}/people", h.createPerson)

		// Expenses
		r.Patch("/expenses/{id}", h.updateExpense)
		r.Delete("/expenses/{id}", h.deleteExpense)
		r.Post("/expenses/{id}/split", h.splitExpense)

		// Incomes
		r.Patch("/incomes/{id}", h.updateIncome)
		r.Delete("/incomes/{id}", h.deleteIncome)

		// People + ledger
		r.Patch("/people/{id}", h.updatePerson)
		r.Delete("/people/{id}", h.deletePerson)
		r.Post("/people/{id}/entries", h.createEntry)

		r.Patch("/entries/{id}", h.updateEntry)
		r.Delete("/entries/{id}", h.deleteEntry)
	})

	return r
}

func corsMiddleware(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
