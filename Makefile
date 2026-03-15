.PHONY: lint test build-frontend load-test docker-backend terraform-fmt

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
