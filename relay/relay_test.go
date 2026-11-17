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
}

func TestCreate(t *testing.T) {
	_, base := setup(t)
	same := fmt.Sprintf(`{"watch":%q,"viewer":%q}`, hashHex(watchToken+id), hashHex(viewerToken+id))
	if status, _ := call(t, base, "PUT", "/channels/"+id, "", same); status != http.StatusNoContent {
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
	envelope := `{"v":1}`
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
	if status, _ := call(t, base, "POST", "/poll", "", strings.Replace(pollBody(0, map[string]int64{id: 0}), watchToken, "x", 1)); status != http.StatusUnauthorized {
		t.Errorf("poll with a wrong token: %d", status)
	}
}

func TestPollAnswersAtOnceAndAcknowledges(t *testing.T) {
	_, base := setup(t)
	for _, n := range []int{1, 2} {
		status, text := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, fmt.Sprintf(`{"n":%d}`, n))
		if status != http.StatusAccepted || text != fmt.Sprintf("{\"q\":%d}\n", n) {
			t.Fatalf("send %d: %d %s", n, status, text)
		}
	}
	_, text := call(t, base, "POST", "/poll", "", pollBody(25, map[string]int64{id: 0, other: 0}))
	var got polled
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Messages[id]) != 2 || string(got.Messages[id][1].E) != `{"n":2}` || got.Messages[id][1].Q != 2 {
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
	call(t, base, "POST", "/channels/"+other+"/to-watch", viewerToken+other, `{"hello":true}`)
	select {
	case text := <-done:
		if !strings.Contains(text, other) || !strings.Contains(text, `"hello":true`) {
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
		call(t, base, "POST", "/channels/"+id+"/to-viewer", watchToken+id, fmt.Sprintf(`{"n":%d}`, n))
	}
	send(1)
	got := events(t, base, "", 2, func() {
		time.Sleep(100 * time.Millisecond)
		send(2)
	})
	if strings.Join(got, "|") != `1 {"n":1}|2 {"n":2}` {
		t.Fatalf("stream: %q", got)
	}
	// Dropped after 1: resumed with 2, then 3.
	send(3)
	got = events(t, base, "1", 2, nil)
	if strings.Join(got, "|") != `2 {"n":2}|3 {"n":3}` {
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
		if status, _ := call(t, base, "POST", "/channels/"+other+"/to-watch", viewerToken+other, `{}`); status == http.StatusTooManyRequests {
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
		if status, _ := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, `{}`); status == http.StatusAccepted {
			accepted++
		}
	}
	if accepted != maxQueued {
		t.Errorf("queued %d, want %d", accepted, maxQueued)
	}
}

func TestIdleChannelsGoAndDeleteWorks(t *testing.T) {
	relay, base := setup(t)
	if status, _ := call(t, base, "DELETE", "/channels/"+other, watchToken+other, ""); status != http.StatusNoContent {
		t.Errorf("delete: %d", status)
	}
	if status, _ := call(t, base, "DELETE", "/channels/"+other, watchToken+other, ""); status != http.StatusNotFound {
		t.Errorf("deleted twice: %d", status)
	}
	clock := time.Now()
	relay.now = func() time.Time { return clock }
	call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, `{}`)
	clock = clock.Add(idleAfter - time.Minute)
	relay.Sweep()
	if status, _ := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, `{}`); status != http.StatusAccepted {
		t.Fatalf("not idle long enough yet: %d", status)
	}
	clock = clock.Add(idleAfter + time.Minute)
	relay.Sweep()
	if status, _ := call(t, base, "POST", "/channels/"+id+"/to-watch", viewerToken+id, `{}`); status != http.StatusNotFound {
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
