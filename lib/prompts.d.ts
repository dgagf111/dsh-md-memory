/**
 * Fixed prompt fragments for the Markdown memory plugin.
 *
 * MEMORY_POLICY is registered as a stable system-prompt section and drives the
 * main agent's memory discipline. It is the only memory writer the plugin has:
 * background extraction was removed in 0.7.0, so a fact is persisted only when
 * the agent calls md_memory_write / md_memory_forget in the same turn, or when
 * the user edits the library on the memory page.
 *
 * The fragment is written in simplified Chinese: the memory bodies and the
 * user-facing surface are Chinese, and the discipline reads better when the
 * instruction language matches the language the entries are written in. Tool
 * names, parameter names and scope values stay in ASCII.
 */
export declare const MEMORY_POLICY: string;
