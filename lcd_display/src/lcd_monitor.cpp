/**
 * NDPi LCD Display Monitor - Main Application
 * 
 * Listens on stdin for JSON-formatted data updates from client_fs.js
 * Renders device status to Waveshare 1.69" LCD display (240x280, ST7789V2)
 * 
 * Display Format:
 *   - Header: Device Name
 *   - Section 1: NDI Status (idle/receiving/error)
 *   - Section 2: IP Address
 *   - Section 3: Resolutions (NDI source / Output)
 *   - Optional: Images from assets
 */

extern "C" {
#include "DEV_Config.h"
#include "LCD_1in69.h"
#include "GUI_Paint.h"
#include "GUI_BMP.h"
#include "../lib/Fonts/fonts.h"
}

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <time.h>
#include <stdint.h>

/* ============================================================================
 * Configuration & Constants
 * ============================================================================ */

#define MAX_STRING_LEN 100
#define STDIN_BUFFER_SIZE 1024
#define UPDATE_DEBOUNCE_MS 500
#define BACKLIGHT_BRIGHTNESS 1023

/* Color definitions */
#define COLOR_BG       BLACK
#define COLOR_TEXT     WHITE
#define COLOR_HEADER   0x001F  /* Blue */
#define COLOR_NDI_OK   0x07E0  /* Green */
#define COLOR_NDI_IDLE 0xFFC0  /* Yellow */
#define COLOR_NDI_ERR  0xF800  /* Red */

/* Display layout constants */
#define DISPLAY_WIDTH  LCD_1IN69_WIDTH
#define DISPLAY_HEIGHT LCD_1IN69_HEIGHT
#define MARGIN_LEFT    5
#define MARGIN_TOP     5
#define LINE_HEIGHT    16

/* ============================================================================
 * Data Structures
 * ============================================================================ */

typedef struct {
    char device_name[MAX_STRING_LEN];
    char device_ip[MAX_STRING_LEN];
    char ndpi_status_ndi[MAX_STRING_LEN];
    char ndpi_status_ndi_source_resolution[MAX_STRING_LEN];
    char output_resolution_current[MAX_STRING_LEN];
    uint32_t last_update_ms;
} DisplayData;

/* ============================================================================
 * Global State
 * ============================================================================ */

static UWORD *g_framebuffer = NULL;
static DisplayData g_display_data = {0};
static DisplayData g_last_rendered = {0};
static uint32_t g_last_render_ms = 0;
static int g_running = 1;

/* ============================================================================
 * Utility Functions
 * ============================================================================ */

/**
 * Get current time in milliseconds
 */
static uint32_t get_time_ms(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (ts.tv_sec * 1000) + (ts.tv_nsec / 1000000);
}

/**
 * Trim whitespace from string
 */
static char* trim_string(char *str)
{
    if (!str) return str;
    
    /* Trim leading whitespace */
    while (*str && (*str == ' ' || *str == '\t' || *str == '\n' || *str == '\r')) {
        str++;
    }
    
    /* Trim trailing whitespace */
    char *end = str + strlen(str) - 1;
    while (end > str && (*end == ' ' || *end == '\t' || *end == '\n' || *end == '\r')) {
        *end = '\0';
        end--;
    }
    
    return str;
}

/**
 * Simple JSON string value extractor
 * Extracts value from: {"key": "value"}
 */
static int extract_json_string(const char *json, const char *key, char *value, int max_len)
{
    if (!json || !key || !value) return 0;
    
    char search_pattern[MAX_STRING_LEN];
    snprintf(search_pattern, sizeof(search_pattern), "\"%s\":", key);
    
    const char *pos = strstr(json, search_pattern);
    if (!pos) return 0;
    
    pos += strlen(search_pattern);
    
    /* Skip whitespace and opening quote */
    while (*pos && (*pos == ' ' || *pos == ':')) pos++;
    if (*pos != '"') return 0;
    pos++;
    
    /* Extract string content until closing quote */
    int len = 0;
    while (*pos && *pos != '"' && len < max_len - 1) {
        value[len++] = *pos++;
    }
    value[len] = '\0';
    
    return len > 0 ? 1 : 0;
}

/**
 * Parse JSON message from stdin
 * Updates g_display_data with extracted values
 */
static int parse_json_message(const char *message)
{
    int updated = 0;
    
    char temp[MAX_STRING_LEN];
    
    /* Try to extract each field */
    if (extract_json_string(message, "device_name", temp, sizeof(temp))) {
        if (strcmp(g_display_data.device_name, temp) != 0) {
            strncpy(g_display_data.device_name, temp, sizeof(g_display_data.device_name) - 1);
            updated = 1;
        }
    }
    
    if (extract_json_string(message, "device_ip", temp, sizeof(temp))) {
        if (strcmp(g_display_data.device_ip, temp) != 0) {
            strncpy(g_display_data.device_ip, temp, sizeof(g_display_data.device_ip) - 1);
            updated = 1;
        }
    }
    
    if (extract_json_string(message, "ndpi_status_ndi", temp, sizeof(temp))) {
        if (strcmp(g_display_data.ndpi_status_ndi, temp) != 0) {
            strncpy(g_display_data.ndpi_status_ndi, temp, sizeof(g_display_data.ndpi_status_ndi) - 1);
            updated = 1;
        }
    }
    
    if (extract_json_string(message, "ndpi_status_ndi_source_resolution", temp, sizeof(temp))) {
        if (strcmp(g_display_data.ndpi_status_ndi_source_resolution, temp) != 0) {
            strncpy(g_display_data.ndpi_status_ndi_source_resolution, temp, 
                    sizeof(g_display_data.ndpi_status_ndi_source_resolution) - 1);
            updated = 1;
        }
    }
    
    if (extract_json_string(message, "output_resolution_current", temp, sizeof(temp))) {
        if (strcmp(g_display_data.output_resolution_current, temp) != 0) {
            strncpy(g_display_data.output_resolution_current, temp, 
                    sizeof(g_display_data.output_resolution_current) - 1);
            updated = 1;
        }
    }
    
    g_display_data.last_update_ms = get_time_ms();
    return updated;
}

/* ============================================================================
 * Display Rendering Functions
 * ============================================================================ */

/**
 * Get color for NDI status indicator
 */
static uint16_t get_ndi_status_color(const char *status)
{
    if (!status || strlen(status) == 0) return COLOR_NDI_IDLE;
    
    if (strcmp(status, "receiving") == 0 || strcmp(status, "connected") == 0) {
        return COLOR_NDI_OK;
    } else if (strcmp(status, "idle") == 0) {
        return COLOR_NDI_IDLE;
    } else {
        return COLOR_NDI_ERR;
    }
}

/**
 * Clear and prepare display for rendering
 */
static void display_clear(void)
{
    Paint_SelectImage(g_framebuffer);
    Paint_Clear(COLOR_BG);
}

/**
 * Truncate string to fit display width (roughly)
 */
static void truncate_string(char *dest, const char *src, int max_chars)
{
    int len = strlen(src);
    if (len > max_chars) {
        strncpy(dest, src, max_chars - 3);
        strcpy(dest + max_chars - 3, "...");
    } else {
        strcpy(dest, src);
    }
}


/**
 * Render the complete display layout
 */
static void render_display(void)
{
    uint16_t y_pos = MARGIN_TOP;
    char truncated[MAX_STRING_LEN];
    
    display_clear();
    
    /* ---- HEADER: Device Name (max 20 chars Font8 = 160px max) ---- */
    truncate_string(truncated, g_display_data.device_name, 20);
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, "Device:", &Font8, COLOR_HEADER, COLOR_BG);
    y_pos += 10;
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, truncated, &Font8, COLOR_TEXT, COLOR_BG);
    y_pos += 15;
    
    /* ---- SECTION 1: NDI Status (max 20 chars Font8) ---- */
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, "NDI Status:", &Font8, COLOR_HEADER, COLOR_BG);
    y_pos += 10;
    truncate_string(truncated, g_display_data.ndpi_status_ndi, 20);
    uint16_t ndi_color = get_ndi_status_color(truncated);
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, truncated, &Font8, ndi_color, COLOR_BG);
    y_pos += 15;
    
    /* ---- SECTION 2: IP Address (max 20 chars Font8) ---- */
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, "IP Address:", &Font8, COLOR_HEADER, COLOR_BG);
    y_pos += 10;
    truncate_string(truncated, g_display_data.device_ip, 20);
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, truncated, &Font8, COLOR_TEXT, COLOR_BG);
    y_pos += 15;
    
    /* ---- SECTION 3: NDI Source Resolution (max 18 chars Font8) ---- */
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, "NDI Res:", &Font8, COLOR_HEADER, COLOR_BG);
    y_pos += 10;
    truncate_string(truncated, g_display_data.ndpi_status_ndi_source_resolution, 18);
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, truncated, &Font8, COLOR_TEXT, COLOR_BG);
    y_pos += 15;
    
    /* ---- SECTION 4: Output Resolution (max 18 chars Font8) ---- */
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, "Out Res:", &Font8, COLOR_HEADER, COLOR_BG);
    y_pos += 10;
    truncate_string(truncated, g_display_data.output_resolution_current, 18);
    Paint_DrawString_EN(MARGIN_LEFT, y_pos, truncated, &Font8, COLOR_TEXT, COLOR_BG);
    
    /* ---- FOOTER: Status Indicator ---- */
    char status_text[32];
    uint32_t now_ms = get_time_ms();
    snprintf(status_text, sizeof(status_text), "Last: %lums ago", 
             (unsigned long)(now_ms - g_display_data.last_update_ms));
    Paint_DrawString_EN(MARGIN_LEFT, DISPLAY_HEIGHT - 15, status_text, &Font8, COLOR_TEXT, COLOR_BG);
    
    /* Refresh display with new framebuffer */
    LCD_1IN69_Display(g_framebuffer);
    
    /* Track last render time and data */
    g_last_render_ms = get_time_ms();
    memcpy(&g_last_rendered, &g_display_data, sizeof(DisplayData));
}

/* ============================================================================
 * Signal Handlers & Initialization
 * ============================================================================ */

/**
 * Signal handler for graceful shutdown (Ctrl+C)
 */
static void signal_handler(int sig)
{
    printf("[ LCD Monitor ] Received signal %d, shutting down gracefully...\n", sig);
    g_running = 0;
}

/**
 * Initialize display hardware and framebuffer
 */
static int display_init(void)
{
    printf("[ LCD Monitor ] Initializing display hardware...\n");
    
    /* Module initialization */
    if (DEV_ModuleInit() != 0) {
        printf("[ LCD Monitor ] ERROR: DEV_ModuleInit() failed\n");
        DEV_ModuleExit();
        return -1;
    }
    
    /* LCD initialization */
    printf("[ LCD Monitor ] Initializing LCD controller (1.69\" ST7789V2)...\n");
    LCD_1IN69_Init(VERTICAL);
    LCD_1IN69_Clear(COLOR_BG);
    LCD_SetBacklight(BACKLIGHT_BRIGHTNESS);
    
    /* Allocate framebuffer */
    uint32_t framebuffer_size = LCD_1IN69_HEIGHT * LCD_1IN69_WIDTH * 2;
    g_framebuffer = (UWORD *)malloc(framebuffer_size);
    if (!g_framebuffer) {
        printf("[ LCD Monitor ] ERROR: Failed to allocate framebuffer (%u bytes)\n", framebuffer_size);
        DEV_ModuleExit();
        return -1;
    }
    
    /* Initialize paint context */
    Paint_NewImage(g_framebuffer, LCD_1IN69_WIDTH, LCD_1IN69_HEIGHT, VERTICAL, COLOR_BG, 16);
    Paint_SelectImage(g_framebuffer);
    Paint_Clear(COLOR_BG);
    
    printf("[ LCD Monitor ] Display initialized successfully\n");
    printf("[ LCD Monitor ] Resolution: %dx%d, Backlight: %d\n", 
           LCD_1IN69_WIDTH, LCD_1IN69_HEIGHT, BACKLIGHT_BRIGHTNESS);
    
    return 0;
}

/**
 * Cleanup and shutdown
 */
static void display_cleanup(void)
{
    printf("[ LCD Monitor ] Cleaning up...\n");
    
    if (g_framebuffer) {
        free(g_framebuffer);
        g_framebuffer = NULL;
    }
    
    LCD_1IN69_Clear(COLOR_BG);
    DEV_ModuleExit();
    
    printf("[ LCD Monitor ] Shutdown complete\n");
}

/* ============================================================================
 * Main Event Loop
 * ============================================================================ */

/**
 * Main application entry point
 */
int main(int argc, char *argv[])
{
    printf("[ LCD Monitor ] NDPi LCD Display Monitor v1.0\n");
    printf("[ LCD Monitor ] Listening on stdin for data updates...\n");
    
    /* Set up signal handling */
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    
    /* Initialize display hardware */
    if (display_init() != 0) {
        fprintf(stderr, "[ LCD Monitor ] FATAL: Failed to initialize display\n");
        return 1;
    }
    
    /* Initialize display data with defaults */
    strncpy(g_display_data.device_name, "NDPi Client", sizeof(g_display_data.device_name) - 1);
    strncpy(g_display_data.device_ip, "waiting...", sizeof(g_display_data.device_ip) - 1);
    strncpy(g_display_data.ndpi_status_ndi, "idle", sizeof(g_display_data.ndpi_status_ndi) - 1);
    g_display_data.last_update_ms = get_time_ms();
    
    /* Initial render */
    render_display();
    
    /* Main event loop - read from stdin and update display */
    char stdin_buffer[STDIN_BUFFER_SIZE] = {0};
    
    printf("[ LCD Monitor ] Entering main loop. Press Ctrl+C to exit.\n");
    
    while (g_running) {
        /* Read a line from stdin with timeout */
        if (fgets(stdin_buffer, sizeof(stdin_buffer), stdin) != NULL) {
            /* Trim and validate input */
            char *message = trim_string(stdin_buffer);
            
            if (message && strlen(message) > 0) {
                printf("[ LCD Monitor ] Received: %s\n", message);
                
                /* Parse JSON message */
                if (parse_json_message(message)) {
                    /* Check debounce */
                    uint32_t now_ms = get_time_ms();
                    if ((now_ms - g_last_render_ms) >= UPDATE_DEBOUNCE_MS) {
                        printf("[ LCD Monitor ] Rendering updated display\n");
                        render_display();
                    } else {
                        printf("[ LCD Monitor ] Skipped render (debounced)\n");
                    }
                }
            }
        } else if (feof(stdin)) {
            /* stdin closed, exit gracefully */
            printf("[ LCD Monitor ] stdin closed, exiting\n");
            break;
        }
    }
    
    /* Cleanup and exit */
    display_cleanup();
    
    printf("[ LCD Monitor ] Exited successfully\n");
    return 0;
}
