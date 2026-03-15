.PHONY: lint test build-frontend load-test docker-backend terraform-fmt security

lint:
	cd frontend && npm run lint
	python3 -m ruff check backend tests loadtests
	python3 -m ruff format --check backend tests loadtests

test:
	python3 -m pytest

build-frontend:
	cd frontend && npm run build

load-test:
	locust -f loadtests/locustfile.py --headless -u 100 -r 10 -t 1m

docker-backend:
	docker build -f backend/Dockerfile -t nexus-archive-backend .

terraform-fmt:
	terraform -chdir=infra/terraform fmt -check -recursive

security:
	python3 -m bandit -r backend -c bandit.yaml
	python3 -m pip_audit
	cd frontend && npm audit --audit-level=high
