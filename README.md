# 룬 진형 체스 — 서버 버전

## Render 에 올리기

1. GitHub 저장소를 하나 만들고, 이 압축 안의 파일들을 **저장소 맨 위(루트)** 에 그대로 올립니다.
   (`server.js`, `package.json`, `index.html` 이 폴더 안에 들어가 있지 않고 바로 보여야 함)
2. Render 대시보드 → **New → Web Service** (Static Site 아님) → 그 저장소 선택
3. 설정
   - Runtime: **Node**
   - Root Directory: **비워 두기**
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Instance: Free 가능
4. Deploy → 발급된 `https://○○○.onrender.com` 주소로 접속, 친구에게도 같은 주소를 보내면 됩니다.

또는 New → **Blueprint** 를 고르면 `render.yaml` 설정이 자동으로 적용됩니다.
무료 플랜은 15분 동안 접속이 없으면 잠들고, 다음 접속 때 깨어나는 데 30초~1분 걸립니다.

## 가장 쉬운 실행 방법

1. [Node.js](https://nodejs.org) 를 설치합니다 (LTS 버전, 한 번만).
2. 압축을 푼 폴더에서
   - **윈도우**: `start-windows.bat` 더블클릭
   - **맥**: `start-mac.command` 더블클릭 (처음엔 우클릭 → 열기)
3. 브라우저가 자동으로 `http://localhost:3000` 을 엽니다.

`npm install` 은 필요 없습니다. 외부 라이브러리를 쓰지 않아요.

## 터미널로 실행

압축을 푼 폴더(server.js 가 있는 폴더) 안에서:

```bash
node server.js
```

포트 변경: `PORT=8080 node server.js` (윈도우 PowerShell: `$env:PORT=8080; node server.js`)

## 친구와 온라인 대전

1. 로비 → **온라인 대전 → 방 만들기** → 방 코드가 나옵니다.
2. 친구가 같은 서버 주소로 접속해 방 코드를 입력하고 **참가**.
3. 각자 편성 후 **준비 완료** → 대전 시작.

새로고침하거나 잠깐 끊겨도 같은 방 코드로 다시 들어가면 이어집니다.

### 다른 곳에 있는 친구와 하려면

`localhost` 는 내 컴퓨터에서만 열립니다.

- **같은 와이파이**: 친구가 `http://내컴퓨터IP:3000` 으로 접속 (윈도우 방화벽 허용 필요할 수 있음)
- **클라우드에 올리기**: Render, Railway, Fly.io 등 Node.js 호스팅에 이 폴더를 올리고 시작 명령을 `node server.js` 로 지정
- **터널**: ngrok, Cloudflare Tunnel 로 3000번 포트를 외부에 공개

## 문제 해결

| 증상 | 해결 |
|---|---|
| `node` 를 찾을 수 없음 / not recognized | Node.js 설치 후 터미널을 새로 열기 |
| `Cannot find module ... server.js` | server.js 가 있는 폴더 **안에서** 실행 |
| 포트를 이미 사용 중 | `PORT=3001 node server.js` 처럼 다른 포트 |

## 파일

| 파일 | 내용 |
|---|---|
| `index.html` | 게임 전체 (엔진, 스프라이트, 음악, UI) |
| `server.js` | 게임 화면 제공 + `/ws` 온라인 방 중계 (Node 기본 기능만 사용) |
| `start-windows.bat` / `start-mac.command` | 더블클릭 실행 파일 |
