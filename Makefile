.PHONY: validate scaffold

validate:
	./scripts/validate_contracts.sh
	./scripts/validate_docs.sh

scaffold:
	@if [ -z "$(TASK)" ]; then echo "usage: make scaffold TASK='请做xxx'"; exit 1; fi
	./scripts/create_delivery_bundle.sh "$(TASK)"
