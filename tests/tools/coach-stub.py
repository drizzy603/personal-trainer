#!/usr/bin/env python3
"""A stand-in for Anthropic's Messages API on this Mac's loopback (plan task C7).

test-native.sh points a Debug build's page at it (the launch argument -fpApiBase http://127.0.0.1:<port>, which the
shell hands the page as window.__FP_SHELL.dev.api; the page takes only a loopback origin) and drives a real coach turn
from the native composer with no API key and no network: the page builds its prompt and tools, sends, runs the tool the
reply asks for, sends the result back and draws the final reply, exactly as it does against the real API.

It answers POST /v1/messages the way the API does: a message ({id, type, role, model, content, stop_reason,
stop_sequence, usage}) or an error ({type: "error", error: {type, message}}) with the API's status codes (401 without
x-api-key, 400 without anthropic-version or with a malformed body, 404 for any other path). A chat turn (a request with
tools) follows the script: a new question from the owner gets the matching turn's opening words and its tool_use
(stop_reason tool_use) when the turn names a tool, else its closing words; the page's tool_result for a tool_use this
stand-in issued gets the closing words (end_turn); an unknown tool_use_id is a 400, as the API says. A question no turn
matches gets the script's default reply. A one-shot call with no tools (Today's coach card, a debrief, Settings' key
check, the AI fills) gets the JSON text those callers parse. Every request is recorded (the key itself never: only
whether one came).

  python3 tests/tools/coach-stub.py [--port 0] [--script FILE]    # serve until killed; one JSON line per request

Script (JSON): {"turns": [{"match": "words in the question", "text": "opening words", "tool": {"name": "...",
"input": {...}}, "final": "closing words", "delay": seconds before the first answer}], "default": "the reply to anything
else"}. tests/tools/native-chat.py imports this file and sets the script per scenario (CoachStub(script).start() gives
the port).
"""
import argparse
import http.server
import json
import sys
import threading
import time

DEFAULT_REPLY = 'Stand-in reply.'
ONE_SHOT = '{"message":"Stand-in card.","actions":[]}'


def _text_of(content):
    """The words of a message's content (a string, or its text blocks joined)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ''.join(b.get('text', '') for b in content if isinstance(b, dict) and b.get('type') == 'text')
    return ''


class CoachStub:
    def __init__(self, script=None, host='127.0.0.1', port=0):
        self.script = script or {}
        self.requests = []
        self.issued = {}          # tool_use id -> the turn that issued it
        self.lock = threading.Lock()
        self.seq = 0
        self.host = host
        self.port = port
        self.server = None
        self.thread = None
        self.echo = None          # a function to print each record (the CLI)

    # The server

    def start(self):
        stub = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.1'

            def log_message(self, *a):
                pass

            def _send(self, status, obj):
                out = json.dumps(obj).encode()
                self.send_response(status)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(out)))
                self.send_header('access-control-allow-origin', '*')
                self.send_header('request-id', 'req_stub_%d' % stub.seq)
                self.end_headers()
                self.wfile.write(out)

            def do_OPTIONS(self):   # a browser's preflight (CapacitorHttp sends none)
                self.send_response(204)
                self.send_header('access-control-allow-origin', '*')
                self.send_header('access-control-allow-headers', '*')
                self.send_header('access-control-allow-methods', 'POST, OPTIONS')
                self.send_header('content-length', '0')
                self.end_headers()

            def do_GET(self):
                self._send(404, stub.error('not_found_error', 'Not found'))

            def do_POST(self):
                n = int(self.headers.get('content-length') or 0)
                raw = self.rfile.read(n) if n else b''
                status, body, rec = stub.answer(self.path, {k.lower(): v for k, v in self.headers.items()}, raw)
                if rec.get('delay'):
                    time.sleep(rec['delay'])   # a slow answer, as the API's can be (the chat shows Thinking meanwhile)
                self._send(status, body)
                if stub.echo:
                    stub.echo(rec)

        self.server = http.server.ThreadingHTTPServer((self.host, self.port), Handler)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return self.port

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.server = None

    @property
    def base(self):
        return 'http://%s:%d' % (self.host, self.port)

    # The API

    @staticmethod
    def error(kind, message):
        return {'type': 'error', 'error': {'type': kind, 'message': message}}

    def message(self, model, content, stop):
        self.seq += 1
        return {'id': 'msg_stub_%03d' % self.seq, 'type': 'message', 'role': 'assistant', 'model': model or 'claude-sonnet-5-5',
                'content': content, 'stop_reason': stop, 'stop_sequence': None,
                'usage': {'input_tokens': 120, 'output_tokens': 24, 'cache_creation_input_tokens': 0, 'cache_read_input_tokens': 0}}

    def turn_for(self, question):
        q = question.lower()
        for t in self.script.get('turns') or []:
            if t.get('match') and t['match'].lower() in q:
                return t
        return None

    def answer(self, path, headers, raw):
        """(status, body, record) for one request."""
        with self.lock:
            rec = {'t': round(time.time(), 3), 'path': path, 'key': bool(headers.get('x-api-key')),
                   'version': headers.get('anthropic-version'), 'beta': headers.get('anthropic-beta'),
                   'browser': headers.get('anthropic-dangerous-direct-browser-access')}
            self.requests.append(rec)
            status, body = self._answer(path, headers, raw, rec)
            rec['status'] = status
            rec['stop'] = body.get('stop_reason') if isinstance(body, dict) else None
            rec['reply'] = _text_of(body.get('content')) if isinstance(body, dict) and body.get('content') else None
            rec['toolUse'] = [b.get('name') for b in (body.get('content') or []) if b.get('type') == 'tool_use'] if isinstance(body, dict) else []
            return status, body, dict(rec)

    def _answer(self, path, headers, raw, rec):
        if path.split('?')[0] != '/v1/messages':
            return 404, self.error('not_found_error', 'Not found')
        if not headers.get('x-api-key'):
            return 401, self.error('authentication_error', 'x-api-key header is required')
        if not headers.get('anthropic-version'):
            return 400, self.error('invalid_request_error', 'anthropic-version: header is required')
        try:
            body = json.loads(raw.decode('utf-8'))
        except Exception:
            return 400, self.error('invalid_request_error', 'There was an error parsing the body')
        msgs = body.get('messages') if isinstance(body, dict) else None
        model = body.get('model') if isinstance(body, dict) else None
        if not isinstance(model, str) or not model:
            return 400, self.error('invalid_request_error', 'model: Field required')
        if not isinstance(body.get('max_tokens'), int) or body['max_tokens'] < 1:
            return 400, self.error('invalid_request_error', 'max_tokens: Field required')
        # (consecutive turns of one role are combined by the API, not refused)
        if not isinstance(msgs, list) or not msgs or not isinstance(msgs[0], dict) or msgs[0].get('role') != 'user':
            return 400, self.error('invalid_request_error', 'messages: the first message must use the "user" role')
        rec['model'] = model
        tools = body.get('tools') or []
        rec['tools'] = len(tools)
        last = msgs[-1]
        results = [b for b in last.get('content') or [] if isinstance(b, dict) and b.get('type') == 'tool_result'] if isinstance(last.get('content'), list) else []
        if not tools:
            rec['kind'] = 'one-shot'
            return 200, self.message(model, [{'type': 'text', 'text': ONE_SHOT}], 'end_turn')
        if results:
            rec['kind'] = 'tool_result'
            rec['results'] = [{'id': r.get('tool_use_id'), 'error': bool(r.get('is_error')), 'content': str(r.get('content'))[:300]} for r in results]
            turn = None
            for r in results:
                if r.get('tool_use_id') not in self.issued:
                    return 400, self.error('invalid_request_error', 'messages: unexpected `tool_use_id` found in `tool_result` blocks: %s' % r.get('tool_use_id'))
                turn = self.issued[r.get('tool_use_id')]
            rec['question'] = turn.get('question')
            return 200, self.message(model, [{'type': 'text', 'text': turn.get('final') or DEFAULT_REPLY}], 'end_turn')
        question = _text_of(last.get('content'))
        rec['kind'] = 'question'
        rec['question'] = question[:200]
        turn = self.turn_for(question)
        if turn and turn.get('delay'):
            rec['delay'] = float(turn['delay'])
        if not turn:
            return 200, self.message(model, [{'type': 'text', 'text': self.script.get('default') or DEFAULT_REPLY}], 'end_turn')
        if not turn.get('tool'):
            return 200, self.message(model, [{'type': 'text', 'text': turn.get('final') or turn.get('text') or DEFAULT_REPLY}], 'end_turn')
        tid = 'toolu_stub_%03d' % (len(self.issued) + 1)
        self.issued[tid] = dict(turn, question=question[:200])
        content = []
        if turn.get('text'):
            content.append({'type': 'text', 'text': turn['text']})
        content.append({'type': 'tool_use', 'id': tid, 'name': turn['tool']['name'], 'input': turn['tool'].get('input') or {}})
        return 200, self.message(model, content, 'tool_use')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=0)
    ap.add_argument('--script', default='')
    o = ap.parse_args()
    script = json.load(open(o.script)) if o.script else {}
    stub = CoachStub(script, port=o.port)
    stub.echo = lambda rec: print(json.dumps(rec), flush=True)
    port = stub.start()
    print('listening %d' % port, flush=True)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        stub.stop()


if __name__ == '__main__':
    sys.exit(main())
