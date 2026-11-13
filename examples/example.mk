# Shared by every cartridge: NAME.s + the SDK runtime -> NAME.rpl
# The cartridge's Makefile sets NAME and includes this file. It works from any
# folder, because the SDK and the tools are found from where this file is.

CORE := $(dir $(lastword $(MAKEFILE_LIST)))..
SDK := $(CORE)/sdk
PYTHON ?= python3
CA65 ?= ca65
LD65 ?= ld65

all: $(NAME).rpl

$(NAME).rpl: $(NAME).o rpl_rt.o $(SDK)/ramplay.cfg
	$(LD65) -C $(SDK)/ramplay.cfg -m $(NAME).map -o $@ $(NAME).o rpl_rt.o
	$(PYTHON) $(CORE)/tools/rplinfo.py $@

$(NAME).o: $(NAME).s $(SDK)/ramplay.inc
	$(CA65) --cpu 65C02 -I $(SDK) -l $(NAME).lst -o $@ $<

rpl_rt.o: $(SDK)/rpl_rt.s $(SDK)/ramplay.inc
	$(CA65) --cpu 65C02 -I $(SDK) -o $@ $<

clean:
	rm -f *.o *.rpl *.map *.lst

.PHONY: all clean
