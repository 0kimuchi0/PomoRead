#!/usr/bin/env bash
# 本番への反映が承認されたあと、ラベル「承認待ち」の付いたマージ済みの PR のうち、
# 今回反映したコミット（RELEASED_SHA）に含まれているものを「本番反映済み」に付け替える。
# 承認を待つ間にマージされた別の PR は、まだ本番に出ていないので「承認待ち」のまま残す。
# 却下（Reject）した版の PR も「承認待ち」のまま残り、次に承認した版に含まれた時点で付け替わる。
#
# 必要な環境変数:
#   GH_TOKEN      PR のラベルを書き換えられるトークン（github.token）
#   RELEASED_SHA  今回本番に反映したコミット
#   REPOSITORY    owner/name
set -euo pipefail

WAITING="承認待ち"
DONE="本番反映済み"

prs=$(gh pr list --repo "$REPOSITORY" --state merged --label "$WAITING" --limit 100 \
  --json number,mergeCommit --jq '.[] | "\(.number) \(.mergeCommit.oid)"')

if [ -z "$prs" ]; then
  echo "ラベル「$WAITING」の PR はない"
  exit 0
fi

while read -r number sha; do
  # 今回反映したコミットに含まれている（その祖先である）ものだけ付け替える
  if git merge-base --is-ancestor "$sha" "$RELEASED_SHA" 2>/dev/null; then
    # gh pr edit は古い Projects の仕組みに触れて失敗することがあるので、REST API で直接付け外しする
    gh api -X POST "repos/$REPOSITORY/issues/$number/labels" -f "labels[]=$DONE" >/dev/null
    gh api -X DELETE "repos/$REPOSITORY/issues/$number/labels/$(jq -rn --arg n "$WAITING" '$n|@uri')" >/dev/null
    echo "PR #$number を「$DONE」に付け替えた"
  else
    echo "PR #$number は今回の反映に含まれていないので「$WAITING」のまま"
  fi
done <<<"$prs"
