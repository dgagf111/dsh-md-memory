/**
 * Fixed prompt fragments for the Markdown memory plugin.
 *
 * MEMORY_POLICY is registered as a stable system-prompt section and drives the
 * main agent's memory discipline. EXTRACTION_POLICY is the instruction given to
 * the background extraction call; it merges ZCode and Claude Code behaviour with
 * the boundaries recorded in DESIGN.md sections 7.1 and 7.2.
 *
 * Both fragments are written in simplified Chinese: the memory bodies and the
 * user-facing surface are Chinese, and the discipline reads better when the
 * instruction language matches the language the entries are written in. Tool
 * names, parameter names and scope values stay in ASCII.
 */
export declare const MEMORY_POLICY: string;
export declare const EXTRACTION_POLICY: string;
