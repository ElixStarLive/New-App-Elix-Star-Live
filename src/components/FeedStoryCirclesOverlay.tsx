import { Search, ArrowLeft } from 'lucide-react';

interface Props {
  title?: string;
  onSearch?: () => void;
  onBack?: () => void;
}

export default function FeedStoryCirclesOverlay({ title = 'STEM', onSearch, onBack }: Props) {
  return (
    <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 pt-[calc(var(--safe-top)+8px)]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-white/80 hover:text-white"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="text-lg font-bold text-white drop-shadow">{title}</h1>
      <button
        type="button"
        onClick={onSearch}
        className="text-white/80 hover:text-white"
        aria-label="Search"
      >
        <Search className="h-5 w-5" />
      </button>
    </div>
  );
}
