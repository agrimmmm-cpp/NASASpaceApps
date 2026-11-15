PY := backend/.venv/bin/python

.PHONY: setup dev test train sanity mock smoke validate-data real-data promote-real

setup:            ## create venv, install backend deps, install frontend deps if the frontend exists
	python3.12 -m venv backend/.venv || python3.11 -m venv backend/.venv
	backend/.venv/bin/pip install -r backend/requirements.txt
	@if [ -f frontend/package.json ]; then cd frontend && npm ci; else echo "(no frontend yet, skipping npm ci)"; fi
	@[ -f .env ] || (cp .env.example .env && echo "created .env from .env.example")

dev:              ## backend :8000 + frontend :5173 (Ctrl-C stops both)
	@./scripts/dev.sh

test:             ## backend tests
	cd backend && .venv/bin/python -m pytest -q

train:            ## train + cache the model on the active data; or: make train DATA=data/candidate/combustion_runs.csv
	cd backend && .venv/bin/python train.py $(if $(DATA),--data ../$(DATA),)

sanity:           ## behaviour sanity checks; or: make sanity DATA=data/candidate/combustion_runs.csv
	cd backend && .venv/bin/python sanity_check.py $(if $(DATA),--data ../$(DATA),)

mock:             ## (re)generate data/mock_combustion_runs.csv (deterministic)
	cd backend && .venv/bin/python mock_data.py

smoke:            ## automated part of the smoke test (docs/08_TASKS.md)
	cd backend && .venv/bin/python smoke.py

validate-data:    ## make validate-data FILE=data/combustion_runs.csv
	cd backend && .venv/bin/python data_loader.py --validate ../$(FILE)

real-data:        ## fetch NASA PSI tables (FLEX, Saffire-II), map to our schema -> data/candidate/ (does NOT activate it)
	$(PY) data/fetch_psi.py
	$(PY) -I data/mapping/psi_to_schema.py
	cd backend && .venv/bin/python data_loader.py --validate ../data/candidate/combustion_runs.csv | tail -2

promote-real:     ## activate the candidate as data/combustion_runs.csv (flips the app to NASA DATA; refuses to overwrite)
	@[ ! -f data/combustion_runs.csv ] || (echo "data/combustion_runs.csv already exists; remove it yourself first" >&2; exit 1)
	cp data/candidate/combustion_runs.csv data/combustion_runs.csv
	@echo "Activated. Restart the backend: the model retrains on the real data (badge = NASA DATA)."
