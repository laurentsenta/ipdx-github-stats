all: out.csv
	@echo "generated `cat ./out.csv | wc -l` lines"

out.json: ./lib/main.js
	node lib/main.js > ./out.json

# ./lib/main.js: %.ts
# 	npm run build

out.csv: out.json
	# https://stackoverflow.com/a/32965227/843194
	jq -r '(map(keys) | add | unique) as $$cols | map(. as $$row | $$cols | map($$row[.])) as $$rows | $$cols, $$rows[] | @csv' ./out.json > out.csv 
