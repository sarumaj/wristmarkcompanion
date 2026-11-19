package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// The relay's server: RELAY_ADDR (default :8081), behind the viewer's nginx, which passes
// /relay/ to it. `relay -check` asks its health endpoint, for the image's health check
// (the image has no shell, nor wget).
func main() {
	check := flag.Bool("check", false, "ask the running relay's health endpoint and exit 0 if it answers")
	flag.Parse()
	addr := os.Getenv("RELAY_ADDR")
	if addr == "" {
		addr = ":8081"
	}
	if *check {
		os.Exit(healthy("http://127.0.0.1" + port(addr)))
	}
	relay := New()
	var handler http.Handler = relay
	if os.Getenv("RELAY_LOG") == "1" {
		handler = logged{relay}
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		MaxHeaderBytes:    8 << 10,
		// No write timeout: the event streams and the long-polls stay open on purpose.
		IdleTimeout: 2 * time.Minute,
		// Nothing about requests in the log: no IDs, no tokens, no bodies.
		ErrorLog: log.New(discard{}, "", 0),
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				relay.Sweep()
			case <-ctx.Done():
				return
			}
		}
	}()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	logState := "off"
	if _, on := handler.(logged); on {
		logState = "on"
	}
	fmt.Fprintf(os.Stderr, "relay listening on %s (request log %s)\n", addr, logState)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// port is the ":port" end of an address.
func port(addr string) string {
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[i:]
		}
	}
	return ":" + addr
}

func healthy(base string) int {
	client := http.Client{Timeout: 3 * time.Second}
	response, err := client.Get(base + "/relay/v1/healthz")
	if err != nil {
		return 1
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }

// logged writes a line per request to stderr, for troubleshooting (RELAY_LOG=1; off by
// default, as the privacy page says): the route as the relay's router knows it, with
// "{id}" for the channel, the answer's status and how long it took. Nothing that tells
// a channel, a person or a message: no IDs, no tokens, no addresses, no bodies.
type logged struct{ next http.Handler }

func (l logged) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	start := time.Now()
	record := &recorder{ResponseWriter: w}
	l.next.ServeHTTP(record, req)
	// The router sets the pattern it matched on the request; a preflight never reaches it.
	route := req.Pattern
	if route == "" {
		route = req.Method + " (no route)"
	}
	status := record.status
	if status == 0 {
		status = http.StatusOK
	}
	fmt.Fprintf(os.Stderr, "%s %d %s%s\n", route, status, time.Since(start).Round(time.Millisecond), record.note)
}

// recorder keeps the status a handler answered with; Unwrap lets the event stream flush
// through it (http.ResponseController).
type recorder struct {
	http.ResponseWriter
	status int
	// For a poll: how many messages its answer carried.
	note string
}

func (r *recorder) WriteHeader(status int) {
	if r.status == 0 {
		r.status = status
	}
	r.ResponseWriter.WriteHeader(status)
}

func (r *recorder) Write(p []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	if r.note == "" && bytes.HasPrefix(p, []byte(`{"gone":`)) {
		r.note = fmt.Sprintf(" messages=%d", bytes.Count(p, []byte(`"q":`)))
	}
	return r.ResponseWriter.Write(p)
}

func (r *recorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }
