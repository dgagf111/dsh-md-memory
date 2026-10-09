import type { IndexResult, Memory, RankedMemory, RetrievalQuery } from './types.js';
/**
 * Deterministic retrieval and context rendering for the Markdown memory plugin.
 *
 * Implements the scoring and filling rules of DESIGN.md section 6: three query
 * channels (current message .70, last two real user messages .20, touched paths
 * .10) with re-normalisation over the channels that actually carry information,
 * field-weighted BM25F-style term scoring with saturation and coverage, IDF over
 * the candidate snapshot, CJK segmentation with low-weight bigrams for
 * unrecognised long words, stopword filtering, alias discounts, and a byte
 * budget that is filled in relevance order.
 *
 * Entries granted from other projects are ranked by the same score but capped by
 * CROSS_PROJECT_SHARE of the total budget, so a chatty neighbour project can
 * never crowd out the current project's own context.
 */
/** Share of the index/body budget that granted projects may occupy together. */
export declare const CROSS_PROJECT_SHARE = 0.5;
/** Which memory block the session reads from, and the handles used in links. */
export interface SourceContext {
    ownSourceKey?: string;
    handles?: Record<string, string>;
}
/**
 * Neutralise template interpolation and protocol-like tags before any memory
 * text is injected into the host context. Idempotent: running it twice changes
 * nothing further.
 */
export declare function escapeContext(text: string): string;
export declare function rankMemories(memories: Memory[], query: RetrievalQuery, sources?: SourceContext): RankedMemory[];
export declare function renderIndex(ranked: RankedMemory[], budgetBytes: number): IndexResult;
/**
 * Render full bodies only for entries with a positive score, capped by maxCount
 * and by the byte budget. Filling the index never implies reading bodies.
 * Granted projects obey the same CROSS_PROJECT_SHARE cap as the index.
 */
export declare function renderBodies(ranked: RankedMemory[], budgetBytes: number, maxCount: number): string;
