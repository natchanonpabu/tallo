package http

import (
	"net/http"

	"tallo_service/internal/service"
)

func (h *handler) createExpense(w http.ResponseWriter, r *http.Request) {
	monthID, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.ExpenseCreate
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.CreateExpense(r.Context(), monthID, in)
	h.month(w, m, err)
}

func (h *handler) updateExpense(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.ExpensePatch
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.UpdateExpense(r.Context(), id, in)
	h.month(w, m, err)
}

func (h *handler) deleteExpense(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.DeleteExpense(r.Context(), id)
	h.month(w, m, err)
}

func (h *handler) splitExpense(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.SplitInput
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.Split(r.Context(), id, in)
	h.month(w, m, err)
}
