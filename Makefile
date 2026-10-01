GO ?= $(if $(GLOVE_GO),$(GLOVE_GO),go)

.PHONY: build check-config test vet check build-firmware

build:
	GLOVE_GO="$(GO)" GLOVE_BUILD_ONLY=1 ./scripts/glove

check-config:
	GLOVE_GO="$(GO)" ./scripts/glove --check-config

test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

check: test vet check-config

build-firmware: check-config
	./scripts/zmk-docker-build.sh
