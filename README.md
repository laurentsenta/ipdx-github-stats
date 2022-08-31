# ipdx/stats

## Setup

```
echo 'export GH_TOKEN="0xxxxx" > ./secrets.sh'
echo 'export DEBUG="true" > ./secrets.sh' # stops earlier
```

## Usage

```
npm run build # or npm run build:watch
source ./secrets.sh && make
cat ./out.csv
```

## TODO

- [ ] Fix jobDurationInMS is always empty

This is an experiment to gather data and plot it.

It's slow & simple:

* we're not taking advantage of concurrency,
* we're not using functional paradigm that would make the code simpler,
* configurations are hardcoded.