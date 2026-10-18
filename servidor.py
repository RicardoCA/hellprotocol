"""Servidor local do Hell Protocol com cache DESATIVADO.

Garante que o PC e o celular baixem sempre a versão mais recente do jogo
(o `python -m http.server` padrão não envia cabeçalhos anti-cache, e o
navegador do celular pode continuar executando JavaScript antigo).

Uso:  python servidor.py        (porta 8000)
      python servidor.py 9000   (porta personalizada)

Depois abra no PC e no celular: http://<ip-do-pc>:8000
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class SemCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


class Servidor(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Servidor(('0.0.0.0', PORT), SemCache) as httpd:
        print('Hell Protocol — servindo em http://0.0.0.0:%d (cache desativado)' % PORT)
        print('Abra no celular: http://<ip-deste-pc>:%d — Ctrl+C para parar' % PORT)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nServidor encerrado.')
