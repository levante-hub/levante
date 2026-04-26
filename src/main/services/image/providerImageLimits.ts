// Floor impuesto por Anthropic (5MB base64). OpenAI (~20MB) y Google aceptan más,
// por lo que cumplir el floor de Anthropic es suficiente para todos los providers soportados.
// Si se añade un provider con límite menor, ajustar aquí.
export const API_IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024;
export const IMAGE_TARGET_RAW_SIZE = Math.floor((API_IMAGE_MAX_BASE64_SIZE * 3) / 4);
export const IMAGE_MAX_WIDTH = 2000;
export const IMAGE_MAX_HEIGHT = 2000;
export const DEFAULT_MAX_MCP_OUTPUT_TOKENS = 25_000;
export const IMAGE_TOKEN_ESTIMATE = 1_600;
