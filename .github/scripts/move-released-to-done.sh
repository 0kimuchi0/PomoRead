#!/usr/bin/env bash
# 本番への反映が承認されたあと、GitHub Projects「PomoRead」の「承認待ち」にある PR のうち、
# 今回反映したコミット（RELEASED_SHA）に含まれているものを「本番反映済み」に移す。
# 承認を待つ間にマージされた別の PR は、まだ本番に出ていないので「承認待ち」のまま残す。
#
# 必要な環境変数:
#   GH_TOKEN      プロジェクトを読み書きできるトークン（GitHub の Secrets の PROJECT_TOKEN）
#   RELEASED_SHA  今回本番に反映したコミット
#   PROJECT_OWNER プロジェクトの持ち主（daiki0828）
#   PROJECT_TITLE プロジェクトの名前（PomoRead）
#   REPOSITORY    owner/name（この PR のリポジトリだけを対象にする）
set -euo pipefail

WAITING="承認待ち"
DONE="本番反映済み"

project=$(gh api graphql -f owner="$PROJECT_OWNER" -f q="$PROJECT_TITLE" -f query='
  query($owner: String!, $q: String!) {
    user(login: $owner) {
      projectsV2(first: 20, query: $q) {
        nodes {
          id title
          field(name: "Status") {
            ... on ProjectV2SingleSelectField { id options { id name } }
          }
        }
      }
    }
  }' --jq ".data.user.projectsV2.nodes | map(select(.title == \"$PROJECT_TITLE\")) | first")

if [ -z "$project" ] || [ "$project" = "null" ]; then
  echo "::warning::プロジェクト「$PROJECT_TITLE」が見つからないので、列の移動はしない"
  exit 0
fi

project_id=$(jq -r '.id' <<<"$project")
field_id=$(jq -r '.field.id' <<<"$project")
done_id=$(jq -r --arg n "$DONE" '.field.options[] | select(.name == $n) | .id' <<<"$project")
if [ -z "$done_id" ]; then
  echo "::warning::Status に「$DONE」がないので、列の移動はしない"
  exit 0
fi

# プロジェクトの項目を 100 件ずつ読み、「承認待ち」の PR を集める
items="[]"
cursor=""
while :; do
  args=(-f project="$project_id" -f query='
    query($project: ID!, $after: String) {
      node(id: $project) {
        ... on ProjectV2 {
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              status: fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
              content {
                ... on PullRequest { number merged mergeCommit { oid } repository { nameWithOwner } }
              }
            }
          }
        }
      }
    }')
  [ -n "$cursor" ] && args+=(-f after="$cursor")
  page=$(gh api graphql "${args[@]}" --jq '.data.node.items')
  items=$(jq -c --argjson page "$page" '. + $page.nodes' <<<"$items")
  [ "$(jq -r '.pageInfo.hasNextPage' <<<"$page")" = "true" ] || break
  cursor=$(jq -r '.pageInfo.endCursor' <<<"$page")
done

waiting=$(jq -c --arg w "$WAITING" --arg repo "$REPOSITORY" '
  .[] | select(.status.name == $w and .content.merged == true and .content.repository.nameWithOwner == $repo)
  | {id, number: .content.number, sha: .content.mergeCommit.oid}' <<<"$items")

if [ -z "$waiting" ]; then
  echo "「$WAITING」の PR はない"
  exit 0
fi

while read -r item; do
  id=$(jq -r '.id' <<<"$item")
  number=$(jq -r '.number' <<<"$item")
  sha=$(jq -r '.sha' <<<"$item")
  # 今回反映したコミットに含まれている（その祖先である）ものだけ移す
  if git merge-base --is-ancestor "$sha" "$RELEASED_SHA" 2>/dev/null; then
    gh api graphql -f project="$project_id" -f item="$id" -f field="$field_id" -f option="$done_id" -f query='
      mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option }
        }) { projectV2Item { id } }
      }' >/dev/null
    echo "PR #$number を「$DONE」に移した"
  else
    echo "PR #$number は今回の反映に含まれていないので「$WAITING」のまま"
  fi
done <<<"$waiting"
