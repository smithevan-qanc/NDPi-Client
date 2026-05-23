###############################################################################
# NDPi LCD Display Monitor - Makefile
# Waveshare ST7789V2 LCD Driver for Raspberry Pi
###############################################################################

# Directory definitions
DIR_Config   = ./lib/Config
DIR_LCD      = ./lib/LCD
DIR_Fonts    = ./lib/Fonts
DIR_GUI      = ./lib/GUI
DIR_SRC      = ./src
DIR_BIN      = ./build

# Collect all source files (.c and .cpp)
OBJ_C = $(wildcard ${DIR_LCD}/*.c ${DIR_Config}/*.c ${DIR_GUI}/*.c ${DIR_Fonts}/*.c ${DIR_SRC}/*.c ${DIR_SRC}/*.cpp)
OBJ_O = $(patsubst %.c,${DIR_BIN}/%.o,$(patsubst %.cpp,${DIR_BIN}/%.o,$(notdir ${OBJ_C})))

TARGET = ${DIR_BIN}/lcd-monitor

# GPIO/SPI Library Selection
# Options: USE_BCM2835_LIB, USE_WIRINGPI_LIB, USE_DEV_LIB (lgpio - modern, recommended)
USELIB = USE_DEV_LIB
DEBUG = -D $(USELIB)

ifeq ($(USELIB), USE_BCM2835_LIB)
    LIB = -lbcm2835 -lm 
else ifeq ($(USELIB), USE_WIRINGPI_LIB)
    LIB = -lwiringPi -lm 
else ifeq ($(USELIB), USE_DEV_LIB)
    LIB = -llgpio -lm 
endif

# Compiler settings
CC = gcc
CXX = g++
MSG = -g -O0 -Wall
CFLAGS = $(MSG) $(DEBUG) -std=c99
CXXFLAGS = $(MSG) $(DEBUG) -std=c++11

# Build rules
.PHONY: all clean help

all: $(TARGET)

$(TARGET): $(OBJ_O)
	@echo "Linking $@..."
	$(CXX) $(CXXFLAGS) $(OBJ_O) -o $@ $(LIB)
	@echo "Build complete: $@"

# Compile source files (.cpp)
${DIR_BIN}/%.o: ${DIR_SRC}/%.cpp
	@mkdir -p ${DIR_BIN}
	@echo "Compiling $<..."
	$(CXX) $(CXXFLAGS) -c $< -o $@ -I $(DIR_Config) -I $(DIR_GUI) -I $(DIR_LCD) -I $(DIR_SRC)

# Compile LCD driver files
${DIR_BIN}/%.o: $(DIR_LCD)/%.c
	@mkdir -p ${DIR_BIN}
	@echo "Compiling $<..."
	$(CC) $(CFLAGS) -c $< -o $@ -I $(DIR_Config)

# Compile font files
${DIR_BIN}/%.o: $(DIR_Fonts)/%.c
	@mkdir -p ${DIR_BIN}
	@echo "Compiling $<..."
	$(CC) $(CFLAGS) -c $< -o $@

# Compile GUI files
${DIR_BIN}/%.o: $(DIR_GUI)/%.c
	@mkdir -p ${DIR_BIN}
	@echo "Compiling $<..."
	$(CC) $(CFLAGS) -c $< -o $@ -I $(DIR_Config) -I $(DIR_LCD)

# Compile Config files
${DIR_BIN}/%.o: $(DIR_Config)/%.c
	@mkdir -p ${DIR_BIN}
	@echo "Compiling $<..."
	$(CC) $(CFLAGS) -c $< -o $@ $(LIB)

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf ${DIR_BIN}
	@echo "Clean complete"

help:
	@echo "NDPi LCD Display Monitor Build System"
	@echo "====================================="
	@echo "Usage:"
	@echo "  make          - Build the lcd-monitor executable"
	@echo "  make clean    - Remove all build artifacts"
	@echo "  make help     - Show this help message"
	@echo ""
	@echo "Configuration:"
	@echo "  GPIO Library: $(USELIB)"
	@echo "  Target: $(TARGET)"
