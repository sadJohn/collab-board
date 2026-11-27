/**
 * Shared validation limits.
 *
 * Every rule lives here so that NestJS validation pipes and the React Hook Form
 * resolvers in the web app validate against exactly the same numbers.
 */

export const TASK_TITLE_MIN_LENGTH = 1;
export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 5000;

export const PROJECT_NAME_MIN_LENGTH = 2;
export const PROJECT_NAME_MAX_LENGTH = 80;
export const PROJECT_KEY_MIN_LENGTH = 2;
export const PROJECT_KEY_MAX_LENGTH = 10;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]*$/;

export const COMMENT_CONTENT_MIN_LENGTH = 1;
export const COMMENT_CONTENT_MAX_LENGTH = 2000;

export const SEARCH_QUERY_MAX_LENGTH = 200;

/** Avatar uploads: presigned direct upload to S3-compatible object storage. */
export const AVATAR_MAX_FILE_SIZE = 2 * 1024 * 1024;
export const AVATAR_ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const DEFAULT_TASK_SORT_FIELD = "position";
export const DEFAULT_SORT_ORDER = "asc";
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Fractional indexing helpers: positions are spaced by this step. */
export const INITIAL_TASK_POSITION = 1000;
export const TASK_POSITION_STEP = 1000;
