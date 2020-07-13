all: backend frontend
	tar -cvf annotator.tar.gz build

.PHONY: all backend frontend

init:
	mkdir -p build

backend: init
	cp backend/*.py build
	cp -r backend/app build

frontend: init
	cd frontend && npm run build && cp -r build ../build/static

clean:
	rm -r build annotator.tar.gz || true