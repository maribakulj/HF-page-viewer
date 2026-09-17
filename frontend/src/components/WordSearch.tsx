export function WordSearch({
  query,
  disabled,
  matchCount,
  activeIndex,
  activePageIndex,
  onQueryChange,
  onPrevious,
  onNext,
}: {
  query: string;
  disabled: boolean;
  matchCount: number;
  activeIndex: number;
  activePageIndex: number | null;
  onQueryChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const hasQuery = query.trim().length > 0;
  const hasMatches = matchCount > 0;

  return (
    <section className="word-search" aria-label="Word search">
      <div className="word-search-heading">
        <div>
          <strong>Find word</strong>
          <p>Exact word · case-insensitive</p>
        </div>
        {hasQuery && (
          <button type="button" className="word-search-clear" onClick={() => onQueryChange("")} aria-label="Clear word search">
            Clear
          </button>
        )}
      </div>
      <input
        type="search"
        value={query}
        disabled={disabled}
        placeholder={disabled ? "Load XML first" : "e.g. armes"}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !hasMatches) return;
          event.preventDefault();
          if (event.shiftKey) onPrevious();
          else onNext();
        }}
        aria-label="Search exact word in OCR text"
      />
      <div className="word-search-footer">
        <span className={hasQuery && !hasMatches ? "word-search-empty" : ""}>
          {!hasQuery
            ? "Search ALTO/PAGE words"
            : hasMatches
              ? `${activeIndex + 1} of ${matchCount}${activePageIndex == null ? "" : ` · page ${activePageIndex + 1}`}`
              : "No matches"}
        </span>
        <div className="word-search-nav" aria-label="Search result navigation">
          <button type="button" onClick={onPrevious} disabled={!hasMatches} aria-label="Previous word match">↑</button>
          <button type="button" onClick={onNext} disabled={!hasMatches} aria-label="Next word match">↓</button>
        </div>
      </div>
    </section>
  );
}
