PY := backend/.venv/bin/python

.PHONY: setup dev test train mock smoke validate-data

setup:            ## create venv, install backend deps, install frontend deps if the frontend exists
	python3.12 -m venv backend/.venv || python3.11 -m venv backend/.venv
	backend/.venv/bin/pip install -r backend/requirements.txt
	@if [ -f frontend/package.json ]; then cd frontend && npm ci; else echo "(no frontend yet, skipping npm ci)"; fi
	@[ -f .env ] || (cp .env.example .env && echo "created .env from .env.example")

dev:              ## backend :8000 + frontend :5173 (Ctrl-C stops both)
	@./scripts/dev.sh

test:             ## backend tests
	cd backend && .venv/bin/python -m pytest -q

train:            ## train + cache the model (Tier 2)
	cd backend && .venv/bin/python train.py

mock:             ## (re)generate data/mock_combustion_runs.csv (deterministic)
	cd backend && .venv/bin/python mock_data.py

smoke:            ## automated part of the smoke test (docs/08_TASKS.md)
	cd backend && .venv/bin/python smoke.py

validate-data:    ## make validate-data FILE=data/combustion_runs.csv
	cd backend && .venv/bin/python data_loader.py --validate ../$(FILE)
