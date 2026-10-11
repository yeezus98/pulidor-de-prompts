#!/usr/bin/env python3
"""Genera la versión de un solo archivo (artefacto de Claude) a partir de src/.
Uso: python3 scripts/build-artifact.py salida.html"""
import re, sys, pathlib
src = pathlib.Path(__file__).resolve().parent.parent / "src"
html = (src / "index.html").read_text()
title = re.search(r"<title>.*?</title>", html, re.S).group(0)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = re.sub(r'\s*<script src="[^"]+"></script>', "", body)
fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap">')
out = (title + "\n" + fonts + "\n<style>\n" + (src / "styles.css").read_text() + "</style>\n" + body.strip() + "\n"
       + "<script>\n" + (src / "engine.js").read_text() + "</script>\n<script>\n" + (src / "app.js").read_text() + "</script>\n")
pathlib.Path(sys.argv[1]).write_text(out)
print("ok", len(out), "bytes")
