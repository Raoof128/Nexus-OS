.PHONY: lint test build-frontend

lint:
	cd frontend && npm run lint
	python3 -m ruff check backend tests
	python3 -m ruff format --check backend tests

test:
	python3 -m pytest

build-frontend:
	cd frontend && npm run build
