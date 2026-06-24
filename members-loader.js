// 개인정보가 담긴 기본 명부는 로컬 파일 실행에서만 불러옵니다.
// GitHub Pages 같은 온라인 배포에서는 로그인 후 Firestore에서 동기화합니다.
if (location.protocol === "file:") {
  document.write('<script src="members-data.js"><\/script>');
}
