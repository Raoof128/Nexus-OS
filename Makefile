# Nexus OS Unified Makefile

.PHONY: help install dev test lint build security docker clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies (backend + frontend)
	python3 -m pip install -e .
	cd frontend && npm install

dev: ## Run development servers (backend + frontend)
	@echo "Starting backend on http://localhost:8000"
	@echo "Starting frontend on http://localhost:5173"
	(python3 backend/app.py & cd frontend && npm run dev)

test: ## Run all tests (pytest + vitest)
	python3 -m pytest
	cd frontend && npm run test

lint: ## Run all linters (ruff + eslint)
	python3 -m ruff check backend tests
	python3 -m ruff format --check backend tests
	cd frontend && npm run lint

build: ## Build frontend assets
	cd frontend && npm run build

security: ## Run security audits
	python3 -m bandit -r backend -c pyproject.toml
	python3 -m pip_audit
	cd frontend && npm audit --audit-level=high

docker: ## Build backend docker image
	docker build -f backend/Dockerfile -t nexus-os-backend .

clean: ## Remove build artifacts
	rm -rf frontend/dist
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -exec rm -rf {} +
