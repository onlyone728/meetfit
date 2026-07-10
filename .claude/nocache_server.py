import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Strip conditional-request headers so the server never answers 304
        # and the browser can't silently reuse a stale cached body.
        for h in ['If-Modified-Since', 'If-None-Match']:
            if h in self.headers:
                del self.headers[h]
        SimpleHTTPRequestHandler.do_GET(self)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        SimpleHTTPRequestHandler.end_headers(self)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    HTTPServer(('', port), NoCacheHandler).serve_forever()
