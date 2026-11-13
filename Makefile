# RamPlay Core build.
#
#   make test       C unit tests, then every protocol vector against its PNG
#   make examples   the example cartridges (needs cc65)
#   make core-test  the system in TypeScript: CPU, VIA, machine, the vectors, cartridge PNG
#   make page       the core page at http://localhost:5174
#   make lib        src/ to lib/: what the npm package ships
#   make all-tests  test and core-test
#   make tables     regenerate the font and palette tables

CC ?= cc
CFLAGS ?= -std=c11 -O2 -Wall -Wextra -Werror
PYTHON ?= python3
BUILD := build
COMMON := firmware/common
COMMON_SRC := $(COMMON)/rpl_parse.c $(COMMON)/rpl_render.c
COMMON_HDR := $(COMMON)/rpl.h $(COMMON)/rpl_font.h $(COMMON)/default_palette.h
EXAMPLES := hello catch pong

.PHONY: test examples core-test page lib all-tests tables clean

test: $(BUILD)/test_rpl $(BUILD)/rplrender
	$(PYTHON) tools/gen_tables.py --check
	$(BUILD)/test_rpl
	$(PYTHON) tests/protocol/run.py --render $(BUILD)/rplrender

$(BUILD)/test_rpl: $(COMMON)/tests/test_rpl.c $(COMMON_SRC) $(COMMON_HDR)
	@mkdir -p $(BUILD)
	$(CC) $(CFLAGS) -o $@ $(COMMON)/tests/test_rpl.c $(COMMON_SRC)

$(BUILD)/rplrender: $(COMMON)/host/rplrender.c $(COMMON_SRC) $(COMMON_HDR)
	@mkdir -p $(BUILD)
	$(CC) $(CFLAGS) -o $@ $(COMMON)/host/rplrender.c $(COMMON_SRC)

tables:
	$(PYTHON) tools/gen_tables.py

examples:
	@for e in $(EXAMPLES); do $(MAKE) -C examples/$$e PYTHON=$(PYTHON) || exit 1; done

# On its own this folder installs its own node_modules. Inside a workspace
# (a platform repository that holds core as a folder) the top installs for it.
node_modules: package.json
	@if [ -d ../node_modules/typescript ]; then mkdir -p node_modules; else npm install --no-audit --no-fund; fi
	@touch node_modules

core-test: examples node_modules
	npm test

page: examples node_modules
	npm run dev

lib: node_modules
	npm run lib

all-tests: test core-test

clean:
	rm -rf $(BUILD) lib dist
	@for e in $(EXAMPLES); do $(MAKE) -C examples/$$e clean; done
