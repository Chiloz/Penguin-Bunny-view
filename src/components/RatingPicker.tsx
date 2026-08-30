import React, { useState } from 'react';
import { Star, MessageSquare } from 'lucide-react';

interface RatingPickerProps {
  initialRatingType?: 'stars' | 'tomatoes';
  initialRatingValue?: number;
  initialReviewComment?: string;
  onSave: (ratingType: 'stars' | 'tomatoes', ratingValue: number, reviewComment: string) => void;
  onCancel?: () => void;
  isCompact?: boolean;
}

export const RatingPicker: React.FC<RatingPickerProps> = ({
  initialRatingType = 'stars',
  initialRatingValue = 5,
  initialReviewComment = '',
  onSave,
  onCancel,
  isCompact = false
}) => {
  const [type, setType] = useState<'stars' | 'tomatoes'>(initialRatingType);
  const [value, setValue] = useState<number>(initialRatingValue || 5);
  const [hoverValue, setHoverValue] = useState<number>(0);
  const [comment, setComment] = useState<string>(initialReviewComment || '');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(type, value, comment.trim());
  };

  const getTomatoLabel = (val: number) => {
    if (val <= 1) return '🍅 Smashed / Hated (20%)';
    if (val === 2) return '🍅 Rotten (40%)';
    if (val === 3) return '🍅 Average (60%)';
    if (val === 4) return '🍅 Fresh! (80%)';
    return '🍅 Certified Fresh! (100%)';
  };

  return (
    <form onSubmit={handleSave} className="space-y-3 bg-white/5 border border-white/10 p-3.5 rounded-2xl backdrop-blur-md">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-white flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          Rate & Review Film
        </label>

        {/* Rating Type Switcher */}
        <div className="flex items-center bg-black/40 border border-white/10 p-0.5 rounded-xl">
          <button
            type="button"
            onClick={() => setType('stars')}
            className={`px-2 py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${
              type === 'stars'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⭐ Stars
          </button>
          <button
            type="button"
            onClick={() => setType('tomatoes')}
            className={`px-2 py-1 text-[10px] font-semibold rounded-lg transition-all cursor-pointer ${
              type === 'tomatoes'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🍅 Tomatoes
          </button>
        </div>
      </div>

      {/* Interactive Rating Scale */}
      <div className="flex items-center justify-between py-1 bg-white/[0.02] border border-white/5 px-3 rounded-xl">
        <span className="text-[10px] text-slate-400 font-mono">
          {type === 'stars' ? `${value} / 5 Stars` : getTomatoLabel(value)}
        </span>

        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((starIndex) => {
            const active = (hoverValue || value) >= starIndex;
            return (
              <button
                key={starIndex}
                type="button"
                onMouseEnter={() => setHoverValue(starIndex)}
                onMouseLeave={() => setHoverValue(0)}
                onClick={() => setValue(starIndex)}
                className="p-1 transition-transform hover:scale-125 cursor-pointer"
              >
                {type === 'stars' ? (
                  <Star
                    className={`w-5 h-5 ${
                      active
                        ? 'text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                        : 'text-slate-600'
                    }`}
                  />
                ) : (
                  <span className={`text-lg transition-opacity ${active ? 'opacity-100 scale-110' : 'opacity-30 grayscale'}`}>
                    🍅
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Review Comment Box */}
      <div>
        <label className="block text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
          <MessageSquare className="w-3 h-3 text-sky-400" />
          Review Comment (Optional)
        </label>
        <textarea
          rows={2}
          maxLength={300}
          placeholder="e.g. Awesome plot, great soundtrack! Or terrible acting..."
          className="w-full px-3 py-1.5 text-xs text-slate-100 liquid-glass-input resize-none"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1 text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-sky-400 to-indigo-500 rounded-lg shadow cursor-pointer hover:opacity-90 active:scale-95"
        >
          Save Rating
        </button>
      </div>
    </form>
  );
};
