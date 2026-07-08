package http

import (
	"net/http"

	"tallo_service/internal/service"
)

func (h *handler) createPerson(w http.ResponseWriter, r *http.Request) {
	monthID, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.PersonCreate
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.CreatePerson(r.Context(), monthID, in)
	h.month(w, m, err)
}

func (h *handler) updatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.PersonPatch
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.UpdatePerson(r.Context(), id, in)
	h.month(w, m, err)
}

func (h *handler) deletePerson(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.DeletePerson(r.Context(), id)
	h.month(w, m, err)
}

func (h *handler) createEntry(w http.ResponseWriter, r *http.Request) {
	personID, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.EntryCreate
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.CreateEntry(r.Context(), personID, in)
	h.month(w, m, err)
}

func (h *handler) updateEntry(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	var in service.EntryPatch
	if err := decodeJSON(r, &in); err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.UpdateEntry(r.Context(), id, in)
	h.month(w, m, err)
}

func (h *handler) deleteEntry(w http.ResponseWriter, r *http.Request) {
	id, err := pathUUID(r)
	if err != nil {
		h.fail(w, err)
		return
	}
	m, err := h.svc.DeleteEntry(r.Context(), id)
	h.month(w, m, err)
}
