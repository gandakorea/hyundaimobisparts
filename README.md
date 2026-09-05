# Hyundai Mobis Parts Order Journal

현대모비스 파츠 주문을 날짜와 대리점별로 기록하는 개인용 웹 앱입니다.

## 주요 기능

- 날짜별 주문 저장과 달력 조회
- 대리점 정보 저장 및 자동 입력
- 파츠번호 가격 조회, 수량별 금액 및 일별/월별/분기별 합계
- 대리점별 PNG와 날짜별 전체 주문 PNG 생성
- 파츠번호 누적 구매 순위
- PC와 iPhone 간 클라우드 동기화
- iPhone 홈 화면에 설치 가능한 PWA

## 운영 주소

- 현대 주문장: https://mobis-parts-order-journal.vercel.app/
- 대성 주문장: https://daesung-mobis-parts-order-journal.vercel.app/
- GitHub: https://github.com/gandakorea/hyundaimobisparts

두 Vercel 프로젝트는 같은 코드를 사용하지만 환경변수로 데이터와 PNG 발신자 문구를 구분합니다.

## 새 컴퓨터에서 시작

Node.js 22.13 이상과 Git을 설치한 뒤 실행합니다.

```bash
git clone https://github.com/gandakorea/hyundaimobisparts.git
cd hyundaimobisparts
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 운영 데이터와 연결하려면 아래 환경변수와 Vercel 로그인이 추가로 필요합니다.

## 필수 환경변수

실제 값은 GitHub에 저장하지 않습니다. 로컬에서는 `.env.local`, 운영에서는 각 Vercel 프로젝트의 Environment Variables에 설정합니다.

| 변수 | 용도 |
| --- | --- |
| `POSTGRES_URL` | 클라우드 주문 데이터베이스 연결 주소 |
| `MOBIS_APP_ID` | 주문장별 데이터 구분 ID |
| `MOBIS_SESSION_SECRET` | 기기 연결 세션 서명용 32자 이상 비밀값 |
| `MOBIS_SYNC_CODE` | 새 PC/iPhone을 연결할 때 입력하는 코드 |
| `NEXT_PUBLIC_FAX_SENDER_LINE` | PNG 두 번째 줄에 표시할 발신자명과 전화번호 |
| `OPENAI_API_KEY` | 파츠 가격 검색 보조 기능용 API 키 |
| `OPENAI_PART_LOOKUP_MODEL` | 선택 사항인 가격 검색 모델명 |

`MOBIS_APP_ID`는 두 주문장에서 서로 다른 값을 유지해야 데이터가 섞이지 않습니다.

## 확인 명령

```bash
npm run dev
npm run build
npm test
git status
```

배포와 데이터 연결 절차는 [docs/OPERATIONS.md](docs/OPERATIONS.md)를 확인하세요. 작업 규정은 [AGENTS.md](AGENTS.md)에 있습니다.

## 보안

- `.env*`, `.vercel/`, 인증 토큰과 데이터베이스 비밀번호는 GitHub에 올리지 않습니다.
- 실제 주문 데이터는 Git 저장소가 아니라 PostgreSQL 데이터베이스에 저장됩니다.
- 새 컴퓨터에서는 Vercel/Supabase에 다시 로그인하고 환경변수를 안전하게 가져와야 합니다.
