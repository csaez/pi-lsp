import type { LspLocation, LspLocationLink, LspRange } from './protocol.js';
export interface LspDocumentSymbol {
    name: string;
    kind: number;
    detail?: string;
    range: LspRange;
    selectionRange: LspRange;
    children?: LspDocumentSymbol[];
    uri?: string;
    containerName?: string;
}
export declare function normalize_location_result(result: LspLocation | LspLocation[] | LspLocationLink | LspLocationLink[] | null): LspLocation[];
export declare function normalize_document_symbol_result(result: LspDocumentSymbol[] | Array<{
    name: string;
    kind: number;
    location: LspLocation;
    containerName?: string;
}> | null): LspDocumentSymbol[];
