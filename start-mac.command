#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "Node.js 가 설치되어 있지 않아요. https://nodejs.org 에서 설치해 주세요."; read -n1; exit 1; fi
(sleep 1; open http://localhost:3000) &
node server.js
