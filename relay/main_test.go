package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// The request log names the route and the answer, and nothing of the channel.
func TestRequestLogHoldsNoChannelID(t *testing.T) {
	out := captureStderr(t, func() {
		server := httptest.NewServer(logged{New()})
		defer server.Close()
		id := "AAAAAAAAAAAAAAAAAAAAAA"
		hash := strings.Repeat("a", 64)
		other := strings.Repeat("b", 64)
		body := strings.NewReader(`{"watch":"` + hash + `","viewer":"` + other + `"}`)
		request, _ := http.NewRequest(http.MethodPut, server.URL+"/relay/v1/channels/"+id, body)
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
		poll := strings.NewReader(`{"wait":0,"channels":[{"id":"` + id + `","token":"x","after":0}]}`)
		response, err = http.Post(server.URL+"/relay/v1/poll", "application/json", poll)
		if err != nil {
			t.Fatal(err)
		}
		_ = response.Body.Close()
	})
	for _, want := range []string{"PUT /relay/v1/channels/{id} 201", "POST /relay/v1/poll 200", "messages=0"} {
		if !strings.Contains(out, want) {
			t.Errorf("log lacks %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "AAAAAAAAAAAAAAAAAAAAAA") || strings.Contains(out, "127.0.0.1") {
		t.Errorf("log holds an ID or an address:\n%s", out)
	}
}

// The event stream still flushes through the log's recorder: its first line comes at once.
func TestRequestLogKeepsTheStreamFlowing(t *testing.T) {
	captureStderr(t, func() {
		server := httptest.NewServer(logged{New()})
		defer server.Close()
		id := "BBBBBBBBBBBBBBBBBBBBBB"
		viewer := sha256.Sum256([]byte("viewer"))
		body := strings.NewReader(`{"watch":"` + strings.Repeat("a", 64) + `","viewer":"` + hex.EncodeToString(viewer[:]) + `"}`)
		request, _ := http.NewRequest(http.MethodPut, server.URL+"/relay/v1/channels/"+id, body)
		if response, err := http.DefaultClient.Do(request); err == nil {
			_ = response.Body.Close()
		}
		request, _ = http.NewRequest(http.MethodGet, server.URL+"/relay/v1/channels/"+id+"/to-viewer", nil)
		request.Header.Set("Authorization", "Bearer viewer")
		client := http.Client{Timeout: 3 * time.Second}
		start := time.Now()
		response, err := client.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer func() { _ = response.Body.Close() }()
		if response.StatusCode != http.StatusOK || !strings.HasPrefix(response.Header.Get("Content-Type"), "text/event-stream") {
			t.Fatalf("not a stream: %d %s", response.StatusCode, response.Header.Get("Content-Type"))
		}
		// The headers come only once the stream flushed them.
		if time.Since(start) > 2*time.Second {
			t.Errorf("the stream's answer took %s", time.Since(start))
		}
	})
}

func captureStderr(t *testing.T, run func()) string {
	t.Helper()
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	saved := os.Stderr
	os.Stderr = writer
	run()
	os.Stderr = saved
	_ = writer.Close()
	var out bytes.Buffer
	_, _ = io.Copy(&out, reader)
	return out.String()
}
