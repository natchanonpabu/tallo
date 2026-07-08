package http

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"tallo_service/internal/service"
)

// decodeJSON reads the request body into dst. An empty body is allowed (dst keeps
// its zero values), so optional-body POSTs work. Malformed JSON is a 400.
func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		if errors.Is(err, io.EOF) {
			return nil
		}
		return &service.ValidationError{Message: "invalid JSON body"}
	}
	return nil
}

// pathUUID parses the {id} path parameter, returning a ValidationError on a
// malformed UUID.
func pathUUID(r *http.Request) (uuid.UUID, error) {
	raw := chi.URLParam(r, "id")
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.UUID{}, &service.ValidationError{Message: "invalid id"}
	}
	return id, nil
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// month writes the full month on success, or maps the error to an envelope.
func (h *handler) month(w http.ResponseWriter, m service.MonthFull, err error) {
	if err != nil {
		h.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// fail maps service errors to the uniform envelope. Driver/internal errors are
// logged server-side and never leaked to the client.
func (h *handler) fail(w http.ResponseWriter, err error) {
	var ve *service.ValidationError
	switch {
	case errors.Is(err, service.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "resource not found")
	case errors.As(err, &ve):
		writeError(w, http.StatusBadRequest, "invalid_request", ve.Message)
	default:
		log.Printf("http: internal error: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "something went wrong")
	}
}
