package http

import (
	"net/http"

	"tallo_service/internal/service"
)

func (h *handler) listMonths(w http.ResponseWriter, r *http.Request) {
	months, err := h.svc.ListMonths(r.Context())
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, months)
}

func (h *handler) createMonth(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Label string `json:"label"`
	}
	if err := decodeJSON(r, &body); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.CreateMonth(r.Context(), body.Label)
	h.month(w, m, err)
}

func (h *handler) getMonth(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.GetMonth(r.Context(), id)
	h.month(w, m, err)
}

func (h *handler) deleteMonth(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	if err := h.svc.DeleteMonth(r.Context(), id); err != nil {
		h.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handler) cloneMonth(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.CloneInput
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.Clone(r.Context(), id, in)
	h.month(w, m, err)
}
