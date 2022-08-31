# ipdx/stats

## Setup

```
echo 'export GH_TOKEN="0xxxxx" > ./secrets.sh'
echo 'export DEBUG="true" > ./secrets.sh' # stops earlier
```

## Usage

```
source ./secrets.sh && npm run build && npm run main 1>lines.jsonvi
```

## TODO

This is an experiment to gather data and plot it.

It's slow & simple:

* we're not taking advantage of concurrency,
* we're not using functional paradigm that would make the code simpler,
* configurations are hardcoded.