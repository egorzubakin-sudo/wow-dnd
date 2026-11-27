#!/usr/bin/env python3
"""Open the extracted Atlas in the default browser using the standard library."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

ROOT = Path(__file__).resolve().parent
ADDRESS = "http://localhost:8000/"


def main():
    if not (ROOT / "index.html").is_file():
        raise SystemExit("Распакуйте весь архив и запустите скрипт из папки Атласа.")
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 8000), handler)
    except OSError as error:
        raise SystemExit(
            f"Не удалось запустить Атлас на порту 8000. "
            f"Если Атлас уже запущен, откройте {ADDRESS}. "
            f"Детали: {error}"
        ) from None
    with server:
        print(f"Атлас открыт по адресу {ADDRESS}", flush=True)
        try:
            webbrowser.open_new_tab(ADDRESS)
        except webbrowser.Error:
            pass  # The printed address is available for a manual launch.
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
