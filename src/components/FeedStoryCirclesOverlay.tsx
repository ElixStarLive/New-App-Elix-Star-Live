import { Search, ChevronLeft } from 'lucide-react';

interface Props {
  title?: string;
  onSearch?: () => void;
  onBack?: () => void;
}

export default function FeedStoryCirclesOverlay({ title = 'STEM', onSearch, onBack }: Props) {
  return (
    <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4 pt-[calc(var(--safe-top)+8px)]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center justify-center"
        aria-label="Back"
      >
        <span className="royce-glow-disc">
          <ChevronLeft size={18} strokeWidth={2.35} className="royce-icon-gold" />
        </span>
      </button>
      <h1 className="elix-silver-red-text text-lg font-bold text-shadow-md drop-shadow">
        {title}
      </h1>
      <button
        type="button"
        onClick={onSearch}
        className="flex items-center justify-center"
        aria-label="Search"
      >
        <span className="royce-glow-disc">
          <Search size={18} strokeWidth={2.25} className="royce-icon-gold" />
        </span>
      </button>
    </div>
  );
}
