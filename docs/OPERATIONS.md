# 운영 및 이전 안내

이 문서는 메인 컴퓨터 변경 후 개발, 배포, 데이터 연결을 복구하는 절차입니다.

## 1. 저장소 복구

```bash
git clone https://github.com/gandakorea/hyundaimobisparts.git
cd hyundaimobisparts
npm install
npm run build
```

Codex에서 이 폴더를 작업공간으로 열면 저장소의 `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `skills-lock.json`을 통해 프로젝트 작업 규정을 다시 사용할 수 있습니다.

## 2. 로컬 환경변수

프로젝트 루트에 `.env.local`을 만들고 필요한 값을 설정합니다. 기존 컴퓨터의 실제 비밀값은 GitHub가 아니라 Vercel 프로젝트 설정이나 비밀번호 관리 수단을 통해 옮깁니다.

```dotenv
POSTGRES_URL=
MOBIS_APP_ID=
MOBIS_SESSION_SECRET=
MOBIS_SYNC_CODE=
NEXT_PUBLIC_FAX_SENDER_LINE=
OPENAI_API_KEY=
OPENAI_PART_LOOKUP_MODEL=
```

현대 주문장과 대성 주문장은 다음 항목을 각각 다르게 설정합니다.

- `MOBIS_APP_ID`: 데이터 저장 영역 구분
- `NEXT_PUBLIC_FAX_SENDER_LINE`: PNG 발신자 문구 구분

## 3. 로컬 실행과 검사

```bash
npm run dev
npm run build
npm test
```

개발 서버 기본 주소는 `http://localhost:3000`입니다. 다른 프로그램이 3000번 포트를 사용하면 Next.js가 안내하는 다음 포트를 사용합니다.

## 4. GitHub 업데이트

```bash
git status
git add <변경한 파일>
git commit -m "변경 내용 설명"
git push origin main
```

커밋하기 전에 `.env.local`, API 키, 데이터베이스 주소, 세션 비밀값이 포함되지 않았는지 확인합니다.

## 5. Vercel 배포

먼저 Vercel CLI에 로그인합니다.

```bash
npx vercel@latest login
```

현대 주문장 배포:

```bash
npx vercel@latest link --yes --project mobis-parts-order-journal --scope park-jong-hwan-s-projects
npx vercel@latest deploy --prod --yes --scope park-jong-hwan-s-projects
```

대성 주문장 배포:

```bash
npx vercel@latest link --yes --project daesung-mobis-parts-order-journal --scope park-jong-hwan-s-projects
npx vercel@latest deploy --prod --yes --scope park-jong-hwan-s-projects
```

두 번째 배포 후 다음 작업을 위해 현대 주문장으로 다시 연결합니다.

```bash
npx vercel@latest link --yes --project mobis-parts-order-journal --scope park-jong-hwan-s-projects
```

## 6. 데이터베이스와 기기 연결

- 주문 데이터는 `POSTGRES_URL`이 가리키는 PostgreSQL의 `private.mobis_app_state`에 저장됩니다.
- 변경 전 상태는 `private.mobis_app_state_history`에 최대 100개까지 백업됩니다.
- 새 PC 또는 iPhone에서 운영 URL을 열고 화면의 기기 연결란에 `MOBIS_SYNC_CODE`를 입력하면 같은 주문 데이터를 불러옵니다.
- 브라우저를 바꾸거나 쿠키를 지우면 연결 코드를 다시 입력해야 할 수 있습니다.
- GitHub 저장소를 복제하는 것만으로 실제 주문 데이터가 복사되지는 않습니다.

## 7. iPhone 설치

1. Safari에서 운영 URL을 엽니다.
2. 공유 버튼을 누릅니다.
3. `홈 화면에 추가`를 선택합니다.
4. 처음 실행한 뒤 기기 연결 코드를 입력합니다.

## 8. 배포 후 확인

- 저장된 날짜를 달력에서 열 수 있는지 확인
- 대리점, 파츠번호, 수량, 가격을 바로 수정할 수 있는지 확인
- `클라우드 저장됨` 상태가 표시되는지 확인
- PNG 생성과 다운로드 확인
- 현대/대성 주문장의 데이터와 발신자 문구가 서로 구분되는지 확인
