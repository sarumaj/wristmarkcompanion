package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const (
	id          = "AAAAAAAAAAAAAAAAAAAAAA"
	other       = "BBBBBBBBBBBBBBBBBBBBBB"
	watchToken  = "watch-token"
	viewerToken = "viewer-token"
)

// env is an envelope of the shape the relay checks, told apart by its counter `s`.
func env(s int) string {
	return fmt.Sprintf(`{"v":1,"r":"AAAAAAAAAAA=","s":%d,"ts":1794873600,"iv":"AAAAAAAAAAAAAAAAAAAAAA==","c":"AA==","t":"AAAAAAAAAAAAAAAAAAAAAA=="}`, s)
}

func hashHex(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// call makes a request to the relay at base and returns the status and the body.
func call(t *testing.T, base, method, path, token, body string, header ...string) (int, string) {
	t.Helper()
	req, err := http.NewRequest(method, base+"/relay/v1"+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	data, _ := io.ReadAll(res.Body)
	if res.Header.Get("Cache-Control") != "no-store" {
		t.Errorf("%s %s: Cache-Control %q", method, path, res.Header.Get("Cache-Control"))
	}
	return res.StatusCode, string(data)
}

func setup(t *testing.T) (*Relay, string) {
	t.Helper()
	relay := New()
	server := httptest.NewServer(relay)
	t.Cleanup(server.Close)
	for _, channel := range []string{id, other} {
		body := fmt.Sprintf(`{"watch":%q,"viewer":%q}`, hashHex(watchToken+channel), hashHex(viewerToken+channel))
		if status, text := call(t, server.URL, "PUT", "/channels/"+channel, "", body); status != http.StatusCreated {
			t.Fatalf("create %s: %d %s", channel, status, text)
		}
	}
	return relay, server.URL
}

func pollBody(wait int, after map[string]int64) string {
	var channels []string
	for _, channel := range []string{id, other} {
		if place, ok := after[channel]; ok {
			channels = append(channels, fmt.Sprintf(`{"id":%q,"token":%q,"after":%d}`, channel, watchToken+channel, place))
		}
	}
	return fmt.Sprintf(`{"wait":%d,"channels":[%s]}`, wait, strings.Join(channels, ","))
}

type polled struct {
	Messages map[string][]message
	Unknown  []string
	Gone     []string
}

func TestCreate(t *testing.T) {
	_, base := setup(t)
	same := fmt.Sprintf(`{"watch":%q,"viewer":%q}`, hashHex(watchToken+id), hashHex(viewerToken+id))
	if status, _ := call(t, base, "PUT", "/channels/"+id, "", same); status != http.StatusOK {
		t.Errorf("the same hashes again: %d", status)
	}
	changed := fmt.Sprintf(`{"watch":%q,"viewer":%q}`, hashHex("x"), hashHex(viewerToken+id))
	if status, text := call(t, base, "PUT", "/channels/"+id, "", changed); status != http.StatusConflict || !strings.Contains(text, `"status":409`) {
		t.Errorf("other hashes: %d %s", status, text)
	}
	for _, bad := range []struct{ path, body string }{
		{"/channels/short", same},
		{"/channels/" + id, `{"watch":"nothex","viewer":"x"}`},
		{"/channels/" + id, `not json`},
		{"/channels/" + id, fmt.Sprintf(`{"watch":%q,"viewer":%q}`, hashHex("a"), hashHex("a"))},
	} {
		if status, _ := call(t, base, "PUT", bad.path, "", bad.body); status != http.StatusBadRequest {
			t.Errorf("PUT %s %s: %d", bad.path, bad.body, status)
		}
	}
}

func TestTokensAndDirections(t *testing.T) {
	_, base := setup(t)
	envelope := env(1)
	cases := []struct {
		method, path, token string
		want                int
	}{
		{"POST", "/channels/" + id + "/to-watch", "", http.StatusUnauthorized},
		{"POST", "/channels/" + id + "/to-watch", "wrong", http.StatusUnauthorized},
		{"POST", "/channels/" + id + "/to-watch", viewerToken + other, http.StatusUnauthorized},
		{"POST", "/channels/" + id + "/to-watch", watchToken + id, http.StatusForbidden},
		{"POST", "/channels/" + id + "/to-viewer", viewerToken + id, http.StatusForbidden},
		{"GET", "/channels/" + id + "/to-viewer", watchToken + id, http.StatusForbidden},
		{"POST", "/channels/CCCCCCCCCCCCCCCCCCCCCC/to-watch", viewerToken + id, http.StatusNotFound},
		{"POST", "/channels/" + id + "/to-watch", viewerToken + id, http.StatusAccepted},
		{"POST", "/channels/" + id + "/to-viewer", watchToken + id, http.StatusAccepted},
	}
	for _, c := range cases {
		if status, text := call(t, base, c.method, c.path, c.token, envelope); status != c.want {
			t.Errorf("%s %s with %q: %d, want %d (%s)", c.method, c.path, c.token, status, c.want, text)
		}
	}
	// A channel polled with another token is gone for this watch, the others polled still.
	if status, text := call(t, base, "POST", "/poll", "", strings.Replace(pollBody(0, map[string]int64{id: 0, other: 0}), watchToken, "x", 1)); status != http.StatusOK || !strings.Contains(text, `"gone":["`+id+`"]`) {
		t.Errorf("poll with a wrong token: %d %s", status, text)
	}
}

func TestPollAnswersAtOnceAndAcknowledges(t *testing.T) {
	_, base := setup(t)
	for _, n := range []int{1, 2} {
		status, text := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, env(n))
		if status != http.StatusAccepted || text != fmt.Sprintf("{\"q\":%d}\n", n) {
			t.Fatalf("send %d: %d %s", n, status, text)
		}
	}
	_, text := call(t, base, "POST", "/poll", "", pollBody(25, map[string]int64{id: 0, other: 0}))
	var got polled
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Messages[id]) != 2 || string(got.Messages[id][1].E) != env(2) || got.Messages[id][1].Q != 2 {
		t.Fatalf("both messages at once: %s", text)
	}
	// Acknowledged up to 1: only 2 again, at once.
	_, text = call(t, base, "POST", "/poll", "", pollBody(25, map[string]int64{id: 1}))
	if !strings.Contains(text, `"q":2`) || strings.Contains(text, `"q":1`) {
		t.Fatalf("after 1: %s", text)
	}
	// Up to 2: nothing left; an empty answer after the wait.
	start := time.Now()
	status, text := call(t, base, "POST", "/poll", "", pollBody(1, map[string]int64{id: 2}))
	if status != http.StatusOK || !strings.Contains(text, `"messages":{}`) || time.Since(start) < 900*time.Millisecond {
		t.Fatalf("empty after the wait: %d %s in %s", status, text, time.Since(start))
	}
}

func TestPollWakesOnAMessage(t *testing.T) {
	_, base := setup(t)
	done := make(chan string)
	go func() {
		_, text := call(t, base, "POST", "/poll", "", pollBody(20, map[string]int64{id: 0, other: 0}))
		done <- text
	}()
	time.Sleep(200 * time.Millisecond)
	start := time.Now()
	call(t, base, "POST", "/channels/"+other+"/to-watch", viewerToken+other, env(7))
	select {
	case text := <-done:
		if !strings.Contains(text, other) || !strings.Contains(text, `"s":7`) {
			t.Errorf("woken with: %s", text)
		}
		if time.Since(start) > time.Second {
			t.Errorf("woken late: %s", time.Since(start))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the long-poll wasn't woken")
	}
}

func TestPollListsChannelsTheRelayLost(t *testing.T) {
	_, base := setup(t)
	body := `{"wait":0,"channels":[{"id":"CCCCCCCCCCCCCCCCCCCCCC","token":"t","after":0}]}`
	status, text := call(t, base, "POST", "/poll", "", body)
	if status != http.StatusOK || !strings.Contains(text, `"unknown":["CCCCCCCCCCCCCCCCCCCCCC"]`) {
		t.Errorf("%d %s", status, text)
	}
	if status, _ := call(t, base, "POST", "/poll", "", `{"wait":0,"channels":[]}`); status != http.StatusBadRequest {
		t.Errorf("no channels: %d", status)
	}
}

// events reads an event stream's events (id and data) until n are read.
func events(t *testing.T, base, lastID string, n int, during func()) []string {
	t.Helper()
	req, _ := http.NewRequest("GET", base+"/relay/v1/channels/"+id+"/to-viewer", nil)
	req.Header.Set("Authorization", "Bearer "+viewerToken+id)
	req.Header.Set("Accept", "text/event-stream")
	if lastID != "" {
		req.Header.Set("Last-Event-ID", lastID)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("Content-Type %q", res.Header.Get("Content-Type"))
	}
	var once sync.Once
	var got []string
	lines := bufio.NewScanner(res.Body)
	current := ""
	timer := time.AfterFunc(5*time.Second, func() { _ = res.Body.Close() })
	defer timer.Stop()
	if during != nil {
		go once.Do(during)
	}
	for len(got) < n && lines.Scan() {
		line := lines.Text()
		switch {
		case strings.HasPrefix(line, "id: "):
			current = line[4:]
		case strings.HasPrefix(line, "data: "):
			got = append(got, current+" "+line[6:])
		}
	}
	return got
}

func TestStreamDeliversAndResumes(t *testing.T) {
	_, base := setup(t)
	send := func(n int) {
		call(t, base, "POST", "/channels/"+id+"/to-viewer", watchToken+id, env(n))
	}
	send(1)
	got := events(t, base, "", 2, func() {
		time.Sleep(100 * time.Millisecond)
		send(2)
	})
	if strings.Join(got, "|") != "1 "+env(1)+"|2 "+env(2) {
		t.Fatalf("stream: %q", got)
	}
	// Dropped after 1: resumed with 2, then 3.
	send(3)
	got = events(t, base, "1", 2, nil)
	if strings.Join(got, "|") != "2 "+env(2)+"|3 "+env(3) {
		t.Fatalf("resumed: %q", got)
	}
}

func TestLimits(t *testing.T) {
	relay, base := setup(t)
	big := `{"x":"` + strings.Repeat("a", maxBody) + `"}`
	if status, _ := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, big); status != http.StatusRequestEntityTooLarge {
		t.Errorf("a large body: %d", status)
	}
	if status, _ := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, `[1]`); status != http.StatusBadRequest {
		t.Errorf("not an object: %d", status)
	}
	// The rate: ten at once, then refused.
	limited := 0
	for range 15 {
		if status, _ := call(t, base, "POST", "/channels/"+other+"/to-watch", viewerToken+other, env(1)); status == http.StatusTooManyRequests {
			limited++
		}
	}
	if limited < 4 {
		t.Errorf("rate limit: %d of 15 refused", limited)
	}
	// The queue: full at maxQueued, with the clock moved on so that the rate allows them.
	clock := time.Now()
	relay.now = func() time.Time { clock = clock.Add(time.Second); return clock }
	accepted := 0
	for range maxQueued + 5 {
		if status, _ := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, env(1)); status == http.StatusAccepted {
			accepted++
		}
	}
	if accepted != maxQueued {
		t.Errorf("queued %d, want %d", accepted, maxQueued)
	}
}

func TestIdleChannelsGoAndDeleteWorks(t *testing.T) {
	relay, base := setup(t)
	if status, _ := call(t, base, "DELETE", "/channels/"+other, watchToken+other, ""); status != http.StatusOK {
		t.Errorf("delete: %d", status)
	}
	if status, _ := call(t, base, "DELETE", "/channels/"+other, watchToken+other, ""); status != http.StatusGone {
		t.Errorf("deleted twice: %d", status)
	}
	clock := time.Now()
	relay.now = func() time.Time { return clock }
	call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, env(1))
	clock = clock.Add(idleAfter - time.Minute)
	relay.Sweep()
	if status, _ := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, env(1)); status != http.StatusAccepted {
		t.Fatalf("not idle long enough yet: %d", status)
	}
	clock = clock.Add(idleAfter + time.Minute)
	relay.Sweep()
	if status, _ := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, env(1)); status != http.StatusNotFound {
		t.Errorf("idle channel still there: %d", status)
	}
}

func TestHealth(t *testing.T) {
	_, base := setup(t)
	if status, text := call(t, base, "GET", "/healthz", "", ""); status != http.StatusOK || !strings.Contains(text, "ok") {
		t.Errorf("%d %s", status, text)
	}
	if healthy(base) != 0 || healthy("http://127.0.0.1:1") != 1 {
		t.Error("the -check probe")
	}
}

// The Android app's page (origin https://localhost) may call the relay: its preflight
// is answered, and its answers carry the origin; no other origin gets either.
func TestCORSForTheApp(t *testing.T) {
	server := httptest.NewServer(New())
	defer server.Close()
	ask := func(method, origin string) *http.Response {
		req, err := http.NewRequest(method, server.URL+"/relay/v1/healthz", nil)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "PUT")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_ = res.Body.Close()
		return res
	}
	pre := ask(http.MethodOptions, appOrigin)
	if pre.StatusCode != http.StatusNoContent || pre.Header.Get("Access-Control-Allow-Origin") != appOrigin ||
		!strings.Contains(pre.Header.Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("preflight: %d %v", pre.StatusCode, pre.Header)
	}
	if got := ask(http.MethodGet, appOrigin).Header.Get("Access-Control-Allow-Origin"); got != appOrigin {
		t.Fatalf("the app's GET: allow-origin %q", got)
	}
	for _, method := range []string{http.MethodGet, http.MethodOptions} {
		if got := ask(method, "https://example.org").Header.Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("another origin's %s: allow-origin %q", method, got)
		}
	}
}

// One side ends the pairing (DELETE): the other learns it from every request, days later
// too, instead of creating the channel again; until the tombstone's time is up.
func TestAnEndedPairingIsGoneForBothSides(t *testing.T) {
	relay, base := setup(t)
	clock := time.Now()
	relay.now = func() time.Time { return clock }
	// The watch waits on both of its channels when the viewer ends one: it learns at once.
	done := make(chan polled)
	go func() {
		_, text := call(t, base, "POST", "/poll", "", pollBody(10, map[string]int64{id: 0, other: 0}))
		var got polled
		_ = json.Unmarshal([]byte(text), &got)
		done <- got
	}()
	time.Sleep(100 * time.Millisecond)
	if status, _ := call(t, base, "DELETE", "/channels/"+id, viewerToken+id, ""); status != http.StatusOK {
		t.Fatalf("delete: %d", status)
	}
	select {
	case got := <-done:
		if len(got.Gone) != 1 || got.Gone[0] != id || len(got.Unknown) != 0 {
			t.Errorf("poll: %+v", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the poll did not answer")
	}
	clock = clock.Add(goneFor - time.Hour)
	body := fmt.Sprintf(`{"watch":%q,"viewer":%q}`, hashHex(watchToken+id), hashHex(viewerToken+id))
	for _, c := range []struct{ method, path, token, body string }{
		{"PUT", "/channels/" + id, "", body},
		{"GET", "/channels/" + id + "/to-viewer", viewerToken + id, ""},
		{"POST", "/channels/" + id + "/to-watch", viewerToken + id, env(1)},
		{"POST", "/channels/" + id + "/to-viewer", watchToken + id, env(1)},
	} {
		if status, text := call(t, base, c.method, c.path, c.token, c.body); status != http.StatusGone {
			t.Errorf("%s %s: %d %s", c.method, c.path, status, text)
		}
	}
	// Without one of its tokens, an ended channel is as unknown as any.
	if status, _ := call(t, base, "POST", "/channels/"+id+"/to-watch", "someone", env(1)); status != http.StatusNotFound {
		t.Errorf("a stranger: %d", status)
	}
	clock = clock.Add(2 * time.Hour)
	relay.Sweep()
	if status, _ := call(t, base, "PUT", "/channels/"+id, "", body); status != http.StatusCreated {
		t.Errorf("after the tombstone's time: %d", status)
	}
}

// The review's scenarios: what the relay must survive.
func TestTheQueueTowardTheViewerNeverBlocksTheWatch(t *testing.T) {
	relay, base := setup(t)
	clock := time.Now()
	relay.now = func() time.Time { clock = clock.Add(time.Second); return clock }
	// No viewer reads: a ring, the oldest dropped, the watch never refused.
	for n := 1; n <= maxQueued+10; n++ {
		if status, text := call(t, base, "POST", "/channels/"+id+"/to-viewer", watchToken+id, env(n)); status != http.StatusAccepted {
			t.Fatalf("event %d: %d %s", n, status, text)
		}
	}
	got := events(t, base, "", 1, nil)
	if len(got) != 1 || !strings.HasPrefix(got[0], "11 ") {
		t.Fatalf("the oldest kept: %q", got)
	}
	// Through an open stream, far more than a queue's worth goes, the ring's bound kept.
	got = events(t, base, fmt.Sprint(maxQueued+10), 2*maxQueued, func() {
		for n := 1; n <= 2*maxQueued; n++ {
			call(t, base, "POST", "/channels/"+id+"/to-viewer", watchToken+id, env(n))
			time.Sleep(2 * time.Millisecond)
		}
	})
	if len(got) != 2*maxQueued {
		t.Fatalf("through an open stream: %d events", len(got))
	}
	relay.mu.Lock()
	left, queued, bytes := len(relay.channels[id].toViewer.messages), relay.queued, relay.channels[id].toViewer.bytes
	relay.mu.Unlock()
	if left > maxQueued || queued != bytes {
		t.Errorf("%d events, %d bytes queued", left, queued)
	}
}

func TestAStalePlaceAfterARestartHidesNothing(t *testing.T) {
	_, base := setup(t)
	call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, env(1))
	// The watch's `after` from before the relay restarted: past the new queue's end.
	_, text := call(t, base, "POST", "/poll", "", pollBody(0, map[string]int64{id: 37}))
	if !strings.Contains(text, `"q":1`) {
		t.Errorf("poll after 37: %s", text)
	}
	call(t, base, "POST", "/channels/"+id+"/to-viewer", watchToken+id, env(1))
	if got := events(t, base, "37", 1, nil); len(got) != 1 || !strings.HasPrefix(got[0], "1 ") {
		t.Errorf("stream after 37: %q", got)
	}
}

func TestPollAnswersAreSmallAndFiveChannelsFit(t *testing.T) {
	relay, base := setup(t)
	clock := time.Now()
	relay.now = func() time.Time { clock = clock.Add(time.Second); return clock }
	for n := 1; n <= 20; n++ {
		call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, env(n))
	}
	var got polled
	_, text := call(t, base, "POST", "/poll", "", pollBody(0, map[string]int64{id: 0}))
	_ = json.Unmarshal([]byte(text), &got)
	if len(got.Messages[id]) != maxPollAnswer {
		t.Fatalf("one answer: %d messages", len(got.Messages[id]))
	}
	_, text = call(t, base, "POST", "/poll", "", pollBody(0, map[string]int64{id: maxPollAnswer}))
	got = polled{}
	_ = json.Unmarshal([]byte(text), &got)
	if len(got.Messages[id]) != maxPollAnswer || got.Messages[id][0].Q != maxPollAnswer+1 {
		t.Fatalf("the next page: %s", text)
	}
	// Four sessions and the one being paired; a lost one is said at once, beside live ones.
	var channels []string
	channels = append(channels, fmt.Sprintf(`{"id":%q,"token":%q,"after":0}`, other, watchToken+other))
	for _, c := range []string{"CCCCCCCCCCCCCCCCCCCCCC", "DDDDDDDDDDDDDDDDDDDDDD", "EEEEEEEEEEEEEEEEEEEEEE", "FFFFFFFFFFFFFFFFFFFFFF"} {
		channels = append(channels, fmt.Sprintf(`{"id":%q,"token":"t","after":0}`, c))
	}
	start := time.Now()
	status, text := call(t, base, "POST", "/poll", "", `{"wait":10,"channels":[`+strings.Join(channels, ",")+`]}`)
	if status != http.StatusOK || !strings.Contains(text, "FFFFFFFFFFFFFFFFFFFFFF") || time.Since(start) > 2*time.Second {
		t.Errorf("five channels: %d %s in %s", status, text, time.Since(start))
	}
}

func TestOnlyEnvelopesAreQueued(t *testing.T) {
	_, base := setup(t)
	for _, bad := range []string{`{}`, `{"v":1}`, strings.Replace(env(1), `"ts":1794873600`, `"ts":-1`, 1), strings.Replace(env(1), `"s":1`, `"s":"1"`, 1)} {
		if status, _ := call(t, base, "POST", "/channels/"+id+"/to-viewer", watchToken+id, bad); status != http.StatusBadRequest {
			t.Errorf("%s: %d", bad, status)
		}
	}
	// Spread over lines, it is queued as one line, which the event stream needs.
	call(t, base, "POST", "/channels/"+id+"/to-viewer", watchToken+id, strings.ReplaceAll(env(1), ",", ",\n "))
	if got := events(t, base, "", 1, nil); len(got) != 1 || got[0] != "1 "+env(1) {
		t.Errorf("compacted: %q", got)
	}
}
