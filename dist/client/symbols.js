export function normalize_location_result(result) {
    if (!result)
        return [];
    const entries = Array.isArray(result) ? result : [result];
    return entries.map((entry) => {
        if ('uri' in entry)
            return entry;
        return {
            uri: entry.targetUri,
            range: entry.targetSelectionRange ?? entry.targetRange,
        };
    });
}
export function normalize_document_symbol_result(result) {
    if (!result)
        return [];
    if (result.length === 0 ||
        ('range' in result[0] && 'selectionRange' in result[0])) {
        return result;
    }
    const symbol_info = result;
    return symbol_info.map((entry) => ({
        name: entry.name,
        kind: entry.kind,
        range: entry.location.range,
        selectionRange: entry.location.range,
        containerName: entry.containerName,
        uri: entry.location.uri,
    }));
}
//# sourceMappingURL=symbols.js.map