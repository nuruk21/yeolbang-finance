# 열방교회 재정관리 온라인·오프라인 설정

이 프로그램은 인터넷이 끊겨도 현재 기기에 계속 저장하고, 연결이 돌아오면 Firebase와 변경사항을 동기화합니다. 같은 Google 계정으로 로그인한 다른 컴퓨터에서도 같은 자료를 볼 수 있습니다.

> 주민등록번호와 재정자료가 포함되므로 Firebase의 **테스트 모드 규칙을 사용하지 마세요.** 허용된 Google 계정만 접근하도록 아래 보안 규칙을 먼저 적용해야 합니다.

## 1. Firebase 프로젝트 준비

별도의 `yeolbang-finance` 프로젝트를 만드는 것을 권장합니다. 기존 출석부 프로젝트와 분리하면 권한과 자료를 관리하기 쉽습니다.

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만듭니다.
2. **프로젝트 설정 → 내 앱 → 웹 앱 추가**를 선택합니다.
3. 표시되는 `firebaseConfig`의 `apiKey`, `authDomain`, `projectId`, `appId`를 복사합니다.
4. **Authentication → Sign-in method**에서 Google 로그인을 활성화합니다.
5. **Firestore Database**를 만들고 Production mode를 선택합니다.

## 2. Firestore 보안 규칙 적용

Firebase Console의 **Firestore Database → Rules**에서 `firestore.rules`의 내용을 붙여 넣습니다.

반드시 아래 이메일을 실제 재정 담당자의 Google 계정으로 바꿉니다.

```text
"YOUR_GOOGLE_EMAIL@gmail.com"
```

담당자가 여러 명이면 쉼표로 추가합니다.

```text
"first@gmail.com",
"second@gmail.com"
```

저장 후 **Publish**를 누릅니다. `교회 데이터 ID`를 `yeolbang`이 아닌 값으로 사용할 경우 규칙의 `match /churches/yeolbang/`도 같은 값으로 변경해야 합니다.

## 3. 프로그램에 Firebase 설정 넣기

두 가지 방법 중 하나를 사용합니다.

### 방법 A — 프로그램 설정 화면

`설정 · 백업 → Firebase 온라인 동기화`에 네 가지 설정값을 입력하고 저장합니다. 이 방식은 현재 브라우저에만 설정됩니다.

### 방법 B — GitHub 배포용 권장 방법

`firebase-config.js`의 `null`을 아래처럼 변경합니다.

```js
window.YOLBANG_FIREBASE_CONFIG = {
  apiKey: "Firebase에서 복사한 값",
  authDomain: "프로젝트ID.firebaseapp.com",
  projectId: "프로젝트ID",
  appId: "Firebase에서 복사한 값",
  churchId: "yeolbang",
  trustedDevice: true
};
```

Firebase 웹 설정값 자체는 비밀번호가 아닙니다. 실제 자료는 Google 로그인과 Firestore 보안 규칙이 보호합니다.

## 4. GitHub Pages 배포

이 폴더에는 개인정보 파일을 제외하고 배포하는 `.github/workflows/pages.yml`이 포함되어 있습니다.

1. GitHub에서 새 저장소를 만듭니다.
2. 이 폴더에서 다음 명령을 실행합니다.

```bash
git init
git add .
git commit -m "열방교회 재정관리 온라인 동기화"
git branch -M main
git remote add origin https://github.com/사용자이름/저장소이름.git
git push -u origin main
```

3. GitHub 저장소의 **Settings → Pages → Build and deployment**에서 Source를 **GitHub Actions**로 선택합니다.
4. Actions의 배포가 끝나면 `https://사용자이름.github.io/저장소이름/`으로 접속합니다.
5. Firebase Console의 **Authentication → Settings → Authorized domains**에 `사용자이름.github.io`를 추가합니다.

GitHub Pages 화면은 공개 주소이지만 교인 명부와 재정자료는 정적 파일에 포함되지 않습니다. 로그인 후 Firestore 보안 규칙을 통과한 사용자만 자료를 받습니다.

교인 선택 목록이 포함된 헌금 엑셀 양식도 개인정보 보호를 위해 GitHub Pages에는 올리지 않습니다. 이 대화에서 받은 양식을 교회 컴퓨터에 보관해 사용하세요. 작성한 엑셀을 온라인 프로그램에 업로드하는 기능은 그대로 사용할 수 있습니다.

## 5. 최초 자료 올리기

1. 배포된 프로그램을 엽니다.
2. `설정 · 백업`에서 **신뢰할 수 있는 교회 기기**를 체크합니다.
3. Google 계정으로 로그인합니다.
4. 현재 브라우저에 기존 자료가 있다면 **지금 동기화**를 누릅니다.
5. 새 온라인 화면에 교인 명부가 없다면 출석부의 JSON 백업을 `출석부 교인 명부 가져오기`로 한 번 불러온 뒤 **지금 동기화**를 누릅니다.

다른 기기에서는 같은 허용 계정으로 로그인하면 자료가 자동으로 내려옵니다.

## 6. 오프라인 사용

- Chrome, Safari 또는 Firefox에서 온라인 상태로 한 번 접속하고 로그인합니다.
- 브라우저의 **홈 화면에 추가 / 앱 설치** 기능을 사용하면 독립 앱처럼 열 수 있습니다.
- 인터넷이 끊기면 로컬 자료로 계속 입력할 수 있습니다.
- 다시 연결되면 변경된 교인·헌금·지출 기록을 Firebase와 자동 동기화합니다.
- 같은 기록을 여러 기기에서 동시에 수정한 경우 마지막으로 저장한 변경이 적용됩니다.

공용 컴퓨터에서는 **신뢰할 수 있는 교회 기기**를 체크하지 말고, 사용 후 반드시 로그아웃하세요. 주민등록번호 접근 권한은 필요한 담당자에게만 허용하고 정기적으로 JSON 백업도 보관하세요.

## 참고 문서

- [Cloud Firestore 오프라인 사용](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [Firebase Google 로그인](https://firebase.google.com/docs/auth/web/google-signin)
- [Cloud Firestore 보안 규칙](https://firebase.google.com/docs/firestore/security/get-started)
- [GitHub Pages 사용자 지정 워크플로](https://docs.github.com/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
