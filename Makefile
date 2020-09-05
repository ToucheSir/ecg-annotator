all: backend frontend
	tar -cvf annotator-`git rev-parse --short HEAD`.tar.gz build

.PHONY: all backend frontend

init:
	mkdir -p build

backend: init
	cp backend/*.py build
	cp -r backend/app build
	rm -r build/app/__pycache__ || true

frontend: init
	cd frontend && npm run build && cp -r build ../build/static

clean:
	rm -r build annotator*.tar.gz || true
