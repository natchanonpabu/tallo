package http

import (
	"net/http"

	"tallo_service/internal/service"
)

func (h *handler) createIncome(w http.ResponseWriter, r *http.Request) {
	monthID, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.IncomeCreate
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.CreateIncome(r.Context(), monthID, in)
	h.month(w, m, err)
}

func (h *handler) updateIncome(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.IncomePatch
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.UpdateIncome(r.Context(), id, in)
	h.month(w, m, err)
}

func (h *handler) deleteIncome(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.DeleteIncome(r.Context(), id)
	h.month(w, m, err)
}
