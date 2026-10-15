# PlayBox

설치 없이 브라우저에서 바로 즐기는 미니 게임 모음입니다.

<https://play-box.cloud>

## 게임

| 게임 | 경로 | 소개 |
|---|---|---|
| Maze Escape | [/maze-escape/](https://play-box.cloud/maze-escape/) | 고양이를 피해 집 안의 먼지를 모두 치우는 로봇청소기 미로 게임 |
| Mole Patch | [/mole-patch/](https://play-box.cloud/mole-patch/) | 두더지 굴을 피해 텃밭을 모두 일구는 지뢰찾기 퍼즐 게임 |
| Ant War | [/ant-war/](https://play-box.cloud/ant-war/) | 개미 행렬을 보내 적 개미굴을 모두 차지하는 실시간 땅따먹기 게임 |
| 검 강화하기 | [/sword/](https://play-box.cloud/sword/) | 버튼 하나로 낡은 목검을 +100 절대검까지 강화하는 확률 게임 |
| Cheese Guard | [/cheese-guard/](https://play-box.cloud/cheese-guard/) | 고양이를 배치해 치즈를 훔치러 오는 생쥐 떼를 막는 디펜스 게임 |

## 구조

```
index.html          랜딩
<게임>/             게임 페이지와 코드 (/<게임>/ 경로)
public/             사이트 공통 파일
public/<게임>/      게임 에셋과 소개 페이지
```

게임 폴더에 `index.html`을 두면 빌드 입력에 자동으로 들어갑니다. 자세한 규칙은 [AGENTS.md](./AGENTS.md)에 있습니다.

## 개발

```bash
yarn install
yarn dev
yarn lint
yarn check   # 모든 게임의 *.check.ts 실행
yarn build
```

`/about/`, `/privacy/` 같은 `public/` 안의 페이지는 `yarn dev`에서 열리지 않습니다. `yarn preview`로 확인하세요.

기여 방법은 [CONTRIBUTING.md](./CONTRIBUTING.md)에 있습니다.
