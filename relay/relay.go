// Package main is the relay of the control channel between the viewer and the watch
// (docs/dev/decisions/004-control-channel.md): it passes end-to-end encrypted envelopes it
// cannot read, one queue each way per channel, the watch's side by long-poll and the
// viewer's by an event stream. Everything is in memory; nothing is logged.
package main

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Limits (docs/dev/decisions/004-control-channel.md#the-relays-api).
const (
	maxBody   = 2048
	maxQueued = 64
	maxRate   = 10 // messages a second per channel, both ways together
	maxWait   = 25 * time.Second
	// The watch's four sessions and the one being paired.
	maxPollIDs = 5
	// The most messages in one answer to the watch's poll, all channels together: a watch
	// takes a small response only, and pages through the rest with `after`.
	maxPollAnswer  = 8
	idleAfter      = 15 * time.Minute
	keepAliveEvery = 15 * time.Second
	// The family needs dozens of channels; the bound keeps a flood of PUTs, and the queues
	// it could fill, from taking the host's memory.
	defaultChannels = 1000
	// The most bytes queued in all channels together.
	defaultQueuedBytes = 32 << 20
	// A deleted channel's tombstone lasts as long as an unused session does on either side
	// (7 days), so that the other side learns the pairing ended whenever it comes back
	// within it, instead of creating the channel again.
	goneFor     = 7 * 24 * time.Hour
	defaultGone = 100000
)

// A channel's ID: 16 random bytes in unpadded base64url. A token hash: SHA-256 in hex.
var (
	idPattern   = regexp.MustCompile(`^[A-Za-z0-9_-]{22}$`)
	hashPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

// message is a queued envelope and its place in its queue (q), which the receiver
// acknowledges (the watch's "after") or resumes from (the viewer's Last-Event-ID).
type message struct {
	Q int64           `json:"q"`
	E json.RawMessage `json:"e"`
}

// queue is one direction of a channel: its messages, the last place given out, the
// waiters to wake when a message comes, and its bytes, also counted in the relay's total.
type queue struct {
	messages []message
	last     int64
	waiters  map[chan struct{}]struct{}
	bytes    int
	total    *int
}

// push queues an envelope. A full queue refuses it, or, as a ring (`ring`), forgets its
// oldest message to make room: the watch's events toward a viewer that isn't reading
// (a closed tab) must not block the watch; the viewer needs only the latest state.
func (q *queue) push(envelope json.RawMessage, ring bool) (int64, bool) {
	if len(q.messages) >= maxQueued {
		if !ring {
			return 0, false
		}
		q.account(-len(q.messages[0].E))
		q.messages = q.messages[1:]
	}
	q.last++
	q.messages = append(q.messages, message{Q: q.last, E: envelope})
	q.account(len(envelope))
	for waiter := range q.waiters {
		close(waiter)
		delete(q.waiters, waiter)
	}
	return q.last, true
}

func (q *queue) account(delta int) {
	q.bytes += delta
	if q.total != nil {
		*q.total += delta
	}
}

// place is a receiver's last place, or 0 when it is past the queue's end: a queue created
// again (a restart, or 15 idle minutes) numbers from 1 again, and a stale place must not
// hide its first messages.
func (q *queue) place(last int64) int64 {
	if last > q.last {
		return 0
	}
	return last
}

// after is at most `limit` messages past place `q`.
func (q *queue) after(place int64, limit int) []message {
	var out []message
	for _, m := range q.messages {
		if m.Q > place && len(out) < limit {
			out = append(out, m)
		}
	}
	return out
}

// drop forgets the messages up to place `q`, acknowledged.
func (q *queue) drop(place int64) {
	kept := q.messages[:0]
	for _, m := range q.messages {
		if m.Q > place {
			kept = append(kept, m)
		} else {
			q.account(-len(m.E))
		}
	}
	q.messages = kept
}

func (q *queue) wait() chan struct{} {
	waiter := make(chan struct{})
	if q.waiters == nil {
		q.waiters = map[chan struct{}]struct{}{}
	}
	q.waiters[waiter] = struct{}{}
	return waiter
}

type channel struct {
	watch, viewer [32]byte
	toWatch       queue
	toViewer      queue
	used          time.Time
	// The rate limit: a bucket of maxRate, refilled by maxRate a second.
	tokens  float64
	refills time.Time
}

func (c *channel) allow(now time.Time) bool {
	c.tokens = min(maxRate, c.tokens+now.Sub(c.refills).Seconds()*maxRate)
	c.refills = now
	if c.tokens < 1 {
		return false
	}
	c.tokens--
	return true
}

// tombstone is what is left of a deleted channel: its token hashes, to tell the side that
// presents one that the pairing ended (410 Gone), until `until`.
type tombstone struct {
	watch, viewer [32]byte
	until         time.Time
}

// Relay is the HTTP handler and its state.
type Relay struct {
	mu       sync.Mutex
	channels map[string]*channel
	gone     map[string]tombstone
	// The most channels and tombstones at once, and the most bytes queued: bounds on memory.
	limit, goneLimit, queuedLimit int
	queued                        int
	// The clock, replaced in the tests.
	now func() time.Time
	mux *http.ServeMux
}

// New returns a relay serving /relay/v1/.
func New() *Relay {
	r := &Relay{
		channels: map[string]*channel{}, gone: map[string]tombstone{},
		limit: defaultChannels, goneLimit: defaultGone, queuedLimit: defaultQueuedBytes,
		now: time.Now, mux: http.NewServeMux(),
	}
	r.mux.HandleFunc("GET /relay/v1/healthz", func(w http.ResponseWriter, _ *http.Request) {
		reply(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.mux.HandleFunc("PUT /relay/v1/channels/{id}", r.create)
	r.mux.HandleFunc("DELETE /relay/v1/channels/{id}", r.remove)
	r.mux.HandleFunc("POST /relay/v1/channels/{id}/to-watch", r.toWatch)
	r.mux.HandleFunc("POST /relay/v1/channels/{id}/to-viewer", r.toViewer)
	r.mux.HandleFunc("GET /relay/v1/channels/{id}/to-viewer", r.stream)
	r.mux.HandleFunc("POST /relay/v1/poll", r.poll)
	return r
}

// appOrigin is the Android app's pages' origin (app/, Capacitor's WebView): the only one
// besides the viewer's own allowed to call the relay from a page (CORS). Every request
// still needs its channel's token; the origin only lets the app's page read the answer.
const appOrigin = "https://localhost"

func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if req.Header.Get("Origin") == appOrigin {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", appOrigin)
		h.Add("Vary", "Origin")
		if req.Method == http.MethodOptions {
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
			h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Last-Event-ID")
			h.Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	r.mux.ServeHTTP(w, req)
}

// Sweep forgets the channels idle for idleAfter, and wakes nobody: their waiters are
// gone with their requests; and the tombstones past their time. Run it every minute.
func (r *Relay) Sweep() {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.now()
	for id, c := range r.channels {
		if now.Sub(c.used) > idleAfter && len(c.toWatch.waiters) == 0 && len(c.toViewer.waiters) == 0 {
			r.queued -= c.toWatch.bytes + c.toViewer.bytes
			delete(r.channels, id)
		}
	}
	for id, t := range r.gone {
		if now.After(t.until) {
			delete(r.gone, id)
		}
	}
}

// ended tells whether the channel `id` was deleted and `token` is one of its tokens: the
// other side ended the pairing. Under the lock.
func (r *Relay) ended(id, token string) bool {
	t, found := r.gone[id]
	return found && r.now().Before(t.until) && (matches(token, t.watch) || matches(token, t.viewer))
}

const endedDetail = "the other side ended this pairing"

// problem writes an RFC 9457 problem, as application/json: the watch's makeWebRequest,
// asked for JSON, may refuse another media type and hide the status behind its own error.
func problem(w http.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"type": "about:blank", "title": http.StatusText(status), "status": status, "detail": detail,
	})
}

func reply(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// read decodes a JSON body of at most maxBody bytes into v; false after a problem.
func read(w http.ResponseWriter, req *http.Request, v any) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, req.Body, maxBody))
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		problem(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("bodies are at most %d bytes", maxBody))
		return false
	case err != nil:
		problem(w, http.StatusBadRequest, "the body could not be read")
		return false
	case json.Unmarshal(body, v) != nil:
		problem(w, http.StatusBadRequest, "the body is not the JSON expected")
		return false
	}
	return true
}

func hashOf(token string) [32]byte { return sha256.Sum256([]byte(token)) }

func matches(token string, hash [32]byte) bool {
	got := hashOf(token)
	return token != "" && subtle.ConstantTimeCompare(got[:], hash[:]) == 1
}

func bearer(req *http.Request) string {
	token, found := strings.CutPrefix(req.Header.Get("Authorization"), "Bearer ")
	if !found {
		return ""
	}
	return token
}

// Whose token: the watch's, the viewer's, or neither.
const (
	nobody = iota
	watchSide
	viewerSide
)

// find returns the channel of the request's ID with the side its token belongs to, under
// the lock, which the caller releases; or writes a problem and returns nil, unlocked.
func (r *Relay) find(w http.ResponseWriter, req *http.Request, token string) (*channel, int) {
	id := req.PathValue("id")
	if !idPattern.MatchString(id) {
		problem(w, http.StatusBadRequest, "not a channel ID")
		return nil, nobody
	}
	r.mu.Lock()
	c := r.channels[id]
	if c == nil {
		ended := r.ended(id, token)
		r.mu.Unlock()
		if ended {
			problem(w, http.StatusGone, endedDetail)
		} else {
			problem(w, http.StatusNotFound, "no such channel: create it again")
		}
		return nil, nobody
	}
	side := nobody
	if matches(token, c.watch) {
		side = watchSide
	} else if matches(token, c.viewer) {
		side = viewerSide
	}
	if side == nobody {
		r.mu.Unlock()
		problem(w, http.StatusUnauthorized, "not a token of this channel")
		return nil, nobody
	}
	c.used = r.now()
	return c, side
}

func (r *Relay) create(w http.ResponseWriter, req *http.Request) {
	id := req.PathValue("id")
	if !idPattern.MatchString(id) {
		problem(w, http.StatusBadRequest, "not a channel ID")
		return
	}
	var body struct{ Watch, Viewer string }
	if !read(w, req, &body) {
		return
	}
	if !hashPattern.MatchString(body.Watch) || !hashPattern.MatchString(body.Viewer) || body.Watch == body.Viewer {
		problem(w, http.StatusBadRequest, "watch and viewer are two SHA-256 hashes in hex")
		return
	}
	var watch, viewer [32]byte
	_, _ = hex.Decode(watch[:], []byte(body.Watch))
	_, _ = hex.Decode(viewer[:], []byte(body.Viewer))
	r.mu.Lock()
	defer r.mu.Unlock()
	if t, found := r.gone[id]; found && t.watch == watch && t.viewer == viewer && r.now().Before(t.until) {
		problem(w, http.StatusGone, endedDetail)
		return
	}
	if c := r.channels[id]; c != nil {
		if c.watch != watch || c.viewer != viewer {
			problem(w, http.StatusConflict, "the channel exists with other tokens")
			return
		}
		c.used = r.now()
		reply(w, http.StatusOK, struct{}{})
		return
	}
	if len(r.channels) >= r.limit {
		problem(w, http.StatusServiceUnavailable, "too many channels: try again later")
		return
	}
	now := r.now()
	c := &channel{watch: watch, viewer: viewer, used: now, tokens: maxRate, refills: now}
	c.toWatch.total = &r.queued
	c.toViewer.total = &r.queued
	r.channels[id] = c
	// A JSON body with every answer: the watch's makeWebRequest, asked for JSON, may take an
	// empty one for an error.
	reply(w, http.StatusCreated, struct{}{})
}

func (r *Relay) remove(w http.ResponseWriter, req *http.Request) {
	c, _ := r.find(w, req, bearer(req))
	if c == nil {
		return
	}
	defer r.mu.Unlock()
	// Wake whoever waits on it, so that they answer at once.
	for _, q := range []*queue{&c.toWatch, &c.toViewer} {
		for waiter := range q.waiters {
			close(waiter)
		}
		q.waiters = nil
	}
	r.queued -= c.toWatch.bytes + c.toViewer.bytes
	delete(r.channels, req.PathValue("id"))
	if len(r.gone) < r.goneLimit {
		r.gone[req.PathValue("id")] = tombstone{watch: c.watch, viewer: c.viewer, until: r.now().Add(goneFor)}
	}
	reply(w, http.StatusOK, struct{}{})
}

// envelope checks a body's shape as an envelope (docs/dev/decisions/004-control-channel.md#messages),
// so that a receiver is never handed one it can't even parse, and returns it compact: one
// line, as an event stream's data line must be.
func envelope(body []byte) (json.RawMessage, bool) {
	var e struct {
		V, S, TS     *int64
		R, IV, C, Tg *string
	}
	var tag struct {
		T *string `json:"t"`
	}
	if json.Unmarshal(body, &e) != nil || json.Unmarshal(body, &tag) != nil {
		return nil, false
	}
	e.Tg = tag.T
	if e.V == nil || e.S == nil || e.TS == nil || *e.S < 1 || *e.TS < 0 || *e.TS > 0xFFFFFFFF ||
		e.R == nil || e.IV == nil || e.C == nil || e.Tg == nil {
		return nil, false
	}
	var compact bytes.Buffer
	if json.Compact(&compact, body) != nil {
		return nil, false
	}
	return compact.Bytes(), true
}

// send queues an envelope from `from` into the channel's queue toward the other side.
func (r *Relay) send(w http.ResponseWriter, req *http.Request, from int) {
	// The body first, without the lock: a slow sender holds up no one else.
	var raw json.RawMessage
	if !read(w, req, &raw) {
		return
	}
	sealed, ok := envelope(raw)
	if !ok {
		problem(w, http.StatusBadRequest, "not an envelope")
		return
	}
	c, side := r.find(w, req, bearer(req))
	if c == nil {
		return
	}
	defer r.mu.Unlock()
	if side != from {
		problem(w, http.StatusForbidden, "this side does not send this way")
		return
	}
	if r.queued+len(sealed) > r.queuedLimit {
		problem(w, http.StatusServiceUnavailable, "the relay is full: try again later")
		return
	}
	if !c.allow(r.now()) {
		problem(w, http.StatusTooManyRequests, fmt.Sprintf("at most %d messages a second", maxRate))
		return
	}
	q := &c.toViewer
	if from == viewerSide {
		q = &c.toWatch
	}
	// Toward the watch, a full queue is the viewer's to hear about (it shows the error);
	// toward the viewer, a ring, which never blocks the watch.
	place, ok := q.push(sealed, from == watchSide)
	if !ok {
		problem(w, http.StatusTooManyRequests, fmt.Sprintf("%d messages wait already", maxQueued))
		return
	}
	reply(w, http.StatusAccepted, map[string]int64{"q": place})
}

func (r *Relay) toWatch(w http.ResponseWriter, req *http.Request)  { r.send(w, req, viewerSide) }
func (r *Relay) toViewer(w http.ResponseWriter, req *http.Request) { r.send(w, req, watchSide) }

// poll is the watch's long-poll over all of its channels: it acknowledges what each
// `after` says it has, and answers as soon as any channel has a message, or after `wait`.
func (r *Relay) poll(w http.ResponseWriter, req *http.Request) {
	var body struct {
		Wait     int
		Channels []struct {
			ID, Token string
			After     int64
		}
	}
	if !read(w, req, &body) {
		return
	}
	if len(body.Channels) == 0 || len(body.Channels) > maxPollIDs {
		problem(w, http.StatusBadRequest, fmt.Sprintf("one to %d channels", maxPollIDs))
		return
	}
	wait := min(max(time.Duration(body.Wait)*time.Second, 0), maxWait)
	deadline := time.NewTimer(wait)
	defer deadline.Stop()
	for {
		r.mu.Lock()
		messages := map[string][]message{}
		unknown := []string{}
		gone := []string{}
		waiters := []chan struct{}{}
		room := maxPollAnswer
		for _, asked := range body.Channels {
			c := r.channels[asked.ID]
			if c == nil {
				if r.ended(asked.ID, asked.Token) {
					gone = append(gone, asked.ID)
				} else {
					unknown = append(unknown, asked.ID)
				}
				continue
			}
			if !matches(asked.Token, c.watch) {
				// Not this watch's channel (another's, with other tokens): gone for it, without
				// failing the poll for its other channels.
				gone = append(gone, asked.ID)
				continue
			}
			c.used = r.now()
			place := c.toWatch.place(asked.After)
			c.toWatch.drop(place)
			if pending := c.toWatch.after(place, room); len(pending) > 0 {
				messages[asked.ID] = pending
				room -= len(pending)
			} else if room > 0 {
				waiters = append(waiters, c.toWatch.wait())
			}
		}
		// Answered at once with anything to say: messages, or channels to create again or
		// to forget.
		if len(messages) > 0 || len(gone) > 0 || len(unknown) > 0 {
			r.forget(body.Channels, waiters)
			r.mu.Unlock()
			reply(w, http.StatusOK, map[string]any{"messages": messages, "unknown": unknown, "gone": gone})
			return
		}
		r.mu.Unlock()
		woken := make(chan struct{})
		stop := make(chan struct{})
		for _, waiter := range waiters {
			go func() {
				select {
				case <-waiter:
					select {
					case woken <- struct{}{}:
					case <-stop:
					}
				case <-stop:
				}
			}()
		}
		select {
		case <-woken:
			close(stop)
			// Round again, collecting what came: the other waiters off their queues first.
			r.mu.Lock()
			r.forget(body.Channels, waiters)
			r.mu.Unlock()
		case <-deadline.C:
			close(stop)
			r.mu.Lock()
			r.forget(body.Channels, waiters)
			r.mu.Unlock()
			reply(w, http.StatusOK, map[string]any{"messages": map[string][]message{}, "unknown": unknown, "gone": gone})
			return
		case <-req.Context().Done():
			close(stop)
			r.mu.Lock()
			r.forget(body.Channels, waiters)
			r.mu.Unlock()
			return
		}
	}
}

// forget takes waiters that were not woken off their queues. Under the lock.
func (r *Relay) forget(asked []struct {
	ID, Token string
	After     int64
}, waiters []chan struct{}) {
	for _, a := range asked {
		if c := r.channels[a.ID]; c != nil {
			for _, waiter := range waiters {
				delete(c.toWatch.waiters, waiter)
			}
		}
	}
}

// stream is the viewer's event stream of the messages toward it: one event per
// envelope, its place as the event's ID, resumed after Last-Event-ID, a comment every
// keepAliveEvery. Messages stay queued (up to maxQueued) so that a dropped stream
// resumes; those a resume has passed are forgotten.
func (r *Relay) stream(w http.ResponseWriter, req *http.Request) {
	c, side := r.find(w, req, bearer(req))
	if c == nil {
		return
	}
	if side != viewerSide {
		r.mu.Unlock()
		problem(w, http.StatusForbidden, "the stream is the viewer's")
		return
	}
	var place int64
	if last := req.Header.Get("Last-Event-ID"); last != "" {
		place, _ = strconv.ParseInt(last, 10, 64)
	}
	place = c.toViewer.place(place)
	c.toViewer.drop(place)
	r.mu.Unlock()
	control := http.NewResponseController(w)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_ = control.Flush()
	keepAlive := time.NewTicker(keepAliveEvery)
	defer keepAlive.Stop()
	for {
		r.mu.Lock()
		if r.channels[req.PathValue("id")] != c {
			// Deleted: the stream ends.
			r.mu.Unlock()
			return
		}
		pending := c.toViewer.after(place, maxQueued)
		var waiter chan struct{}
		if len(pending) == 0 {
			waiter = c.toViewer.wait()
		}
		r.mu.Unlock()
		for _, m := range pending {
			if _, err := fmt.Fprintf(w, "id: %d\ndata: %s\n\n", m.Q, m.E); err != nil {
				return
			}
			place = m.Q
		}
		if len(pending) > 0 {
			if control.Flush() != nil {
				return
			}
			continue
		}
		select {
		case <-waiter:
		case <-keepAlive.C:
			r.unwait(c, waiter)
			if _, err := io.WriteString(w, ": keep-alive\n\n"); err != nil || control.Flush() != nil {
				return
			}
		case <-req.Context().Done():
			r.unwait(c, waiter)
			return
		}
	}
}

func (r *Relay) unwait(c *channel, waiter chan struct{}) {
	r.mu.Lock()
	delete(c.toViewer.waiters, waiter)
	r.mu.Unlock()
}
