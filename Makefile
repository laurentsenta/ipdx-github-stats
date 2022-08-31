OWNER=laurentsenta
REPO=test-plans
MAKEFLAGS += -j2

all: out.csv
	@echo "generated `cat ./out.csv | wc -l` lines"

./out/20220830.json: ./lib/main.js
	node lib/main.js fetch ${OWNER} ${REPO} laurent-statistics-3008 > ./out/20220830.json

./out/20220825.json: ./lib/main.js
	node lib/main.js fetch ${OWNER} ${REPO} laurent-statistics-2508 > ./out/20220825.json

./out.json: ./out/20220830.json ./out/20220825.json
	node lib/main.js merge ./out/*.json > ./out.json

# ./lib/main.js: %.ts
# 	npm run build

out.csv: out.json
	# https://stackoverflow.com/a/32965227/843194
	jq -r '(map(keys) | add | unique) as $$cols | map(. as $$row | $$cols | map($$row[.])) as $$rows | $$cols, $$rows[] | @csv' ./out.json > out.csv 
